const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const Recurring = require('../models/Recurring');
const Transaction = require('../models/Transaction');
const { addInterval, todayTH } = require('./recurringRunner');
const { thaiPeriod } = require('./budgetCarry');

// "เงินที่ใช้ได้จริง" + ไฟสถานะงบ (คำนวณด้วยโค้ดล้วน ไม่ใช้ AI)
//  ใช้ได้อีก = งบรวม (หมวดที่ตั้งงบและเปิดใช้เดือนนี้) − รายจ่ายเดือนนี้ในหมวดเหล่านั้น − เงินที่กันไว้
//  เงินที่กันไว้ = รายการเกิดซ้ำ (รายจ่าย) ที่ยังไม่ถึงวันจ่ายในเดือนนี้ และอยู่ในหมวดที่ตั้งงบ
//  (รายการเกิดซ้ำในหมวดที่ไม่ได้ตั้งงบไม่หัก เพราะไม่ได้อยู่ในแผนงบ)

const LUMPY_MAX_COUNT = 3; // ตรรกะเดียวกับหน้าวางแผน: เฉลี่ยน้อยกว่า 3 รายการ/เดือน = จ่ายเป็นก้อน
const PACE_CAREFUL = 15; // ใช้เร็วกว่าแผนไม่เกิน 15 จุด = ระวังนิดนึง เกินนั้น = พักก่อน
const PAY_STYLES = ['auto', 'lump', 'spread'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const monthStart = (year, month) => new Date(Date.UTC(year, month - 1, 1));
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// รอบของรายการเกิดซ้ำที่ยังไม่ถูกสร้างเป็นรายการ ภายในช่วง [from, end) (end ไม่รวม)
function pendingOccurrences(rule, from, end) {
  const out = [];
  if (!rule.nextRun) return out;
  const anchor = rule.startDate ? rule.startDate.getUTCDate() : rule.nextRun.getUTCDate();
  let cur = rule.nextRun;
  let guard = 0;
  while (cur < end && guard++ < 400) {
    if (rule.endDate && cur > rule.endDate) break;
    if (cur >= from) out.push(cur);
    cur = addInterval(cur, rule.frequency, anchor);
  }
  return out;
}

// รวมรอบของรายการเดียวกัน (บันทึก + ยอดเท่ากัน) เป็นกลุ่มเดียว เช่น รายการรายวัน 4 รอบ → { note, amount, count: 4, first, last, total }
function groupItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.note}|${it.amount}`;
    const g = map.get(key) || { note: it.note, amount: it.amount, count: 0, first: it.date, last: it.date, total: 0 };
    g.count += 1;
    g.total = round2(g.total + it.amount);
    if (it.date < g.first) g.first = it.date;
    if (it.date > g.last) g.last = it.date;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.first.localeCompare(b.first));
}

// เงินที่กันไว้ของเดือน (เฉพาะเดือนปัจจุบัน) แยกตามหมวด: Map<categoryId, { total, items: [{ note, amount, date }] }>
async function reservedByCategory(userId, categoryIds, { now = Date.now() } = {}) {
  const map = new Map();
  if (!categoryIds.length) return map;
  const { month, year } = thaiPeriod(now);
  const end = monthStart(year, month + 1);
  const today = todayTH();
  const rules = await Recurring.find({
    user: userId, type: 'expense', isActive: true, category: { $in: categoryIds }, nextRun: { $lt: end },
  }).lean();
  for (const r of rules) {
    // รอบที่ถึงกำหนดแล้วแต่ระบบยังไม่สร้างรายการ (nextRun <= วันนี้) ยังไม่อยู่ในยอดที่ใช้ไป จึงนับรวมด้วย
    for (const d of pendingOccurrences(r, monthStart(year, month), end)) {
      const key = String(r.category);
      const e = map.get(key) || { total: 0, items: [] };
      e.total = round2(e.total + r.amount);
      e.items.push({ note: r.note || '', amount: r.amount, date: d.toISOString().slice(0, 10), due: d <= today });
      map.set(key, e);
    }
  }
  return map;
}

// หมวดที่ "จ่ายเป็นก้อน" จากประวัติ 3 เดือนเต็มก่อนหน้า (นับเฉพาะเดือนที่ผู้ใช้มีรายจ่าย)
// คืน Set<categoryId> (หมวดที่ไม่มีประวัติเลย ไม่ถือว่าเป็นก้อน)
async function lumpyCategories(userId, year, month) {
  const from = monthStart(year, month - 3);
  const to = monthStart(year, month);
  const rows = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(String(userId)), type: 'expense', date: { $gte: from, $lt: to } } },
    { $group: { _id: { c: '$category', y: { $year: '$date' }, m: { $month: '$date' } }, n: { $sum: 1 } } },
  ]);
  const months = new Set(rows.map((r) => `${r._id.y}-${r._id.m}`));
  const out = new Set();
  if (!months.size) return out;
  const counts = new Map();
  for (const r of rows) counts.set(String(r._id.c), (counts.get(String(r._id.c)) || 0) + r.n);
  for (const [c, n] of counts) if (n > 0 && n / months.size < LUMPY_MAX_COUNT) out.add(c);
  return out;
}

// % ของเดือนที่ผ่านไป: เดือนปัจจุบัน = วันที่วันนี้ ÷ จำนวนวัน, เดือนอดีต = 100, เดือนอนาคต = 0
function elapsedPct(year, month, now = Date.now()) {
  const cur = thaiPeriod(now);
  const idx = year * 12 + month;
  const curIdx = cur.year * 12 + cur.month;
  if (idx < curIdx) return 100;
  if (idx > curIdx) return 0;
  const day = new Date(now + 7 * 3600 * 1000).getUTCDate();
  return Math.round((day / daysIn(year, month)) * 1000) / 10;
}

// ไฟสถานะของงบหนึ่งหมวด
//  ทยอยจ่าย: easy (สบาย) / careful (ระวังนิดนึง) / pause (พักก่อน) / over (เกินงบ)  เดือนอดีต: within (อยู่ในงบ) / over
//  จ่ายเป็นก้อน: unpaid (ยังไม่จ่าย) / paid (จ่ายแล้ว) / over (เกินงบ)
//  ปิดไว้: off / เดือนอนาคต: null
function paceStatus({ enabled, spent, limit, lumpy, elapsed }) {
  if (!enabled) return 'off';
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  if (lumpy) return spent <= 0 ? 'unpaid' : spent > limit ? 'over' : 'paid';
  if (elapsed <= 0) return null;
  if (spent > limit) return 'over';
  if (elapsed >= 100) return 'within';
  const ahead = pct - elapsed;
  if (ahead <= 0) return 'easy';
  return ahead <= PACE_CAREFUL ? 'careful' : 'pause';
}

// สรุป "ใช้ได้อีก" ของเดือนปัจจุบัน (ใช้บน Dashboard)
async function spendableFor(userId, { now = Date.now() } = {}) {
  const { month, year } = thaiPeriod(now);
  const budgets = await Budget.find({ user: userId, month, year, stopped: { $ne: true }, enabled: { $ne: false } }).lean();
  if (!budgets.length) return { has_budget: false, month, year };
  const catIds = budgets.map((b) => b.category);
  const spentRows = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)), type: 'expense', category: { $in: catIds },
        date: { $gte: monthStart(year, month), $lt: monthStart(year, month + 1) },
      },
    },
    { $group: { _id: '$category', spent: { $sum: '$amount' } } },
  ]);
  const spentBy = new Map(spentRows.map((r) => [String(r._id), r.spent]));
  const limit = round2(budgets.reduce((s, b) => s + b.amountLimit, 0));
  const spent = round2(spentRows.reduce((s, r) => s + r.spent, 0));
  const reservedMap = await reservedByCategory(userId, catIds, { now });
  const cats = await Category.find({ _id: { $in: catIds } }, { name: 1, color: 1, icon: 1 }).lean();
  const catBy = new Map(cats.map((c) => [String(c._id), c]));
  // ยอดเหลือแยกหมวด (สูตรเดียวกับยอดรวม: งบ − ใช้ไป − กันไว้) เรียงหมวดที่เหลือน้อยก่อน
  const categories = budgets.map((b) => {
    const id = String(b.category);
    const c = catBy.get(id) || {};
    const s = round2(spentBy.get(id) || 0);
    const r = round2((reservedMap.get(id) || { total: 0 }).total);
    return {
      category_id: id, name: c.name || 'ไม่ระบุหมวด', color: c.color || '#9AAB91', icon: c.icon || '',
      limit: b.amountLimit, spent: s, reserved: r, remaining: round2(b.amountLimit - s - r),
    };
  }).sort((a, b) => a.remaining - b.remaining);
  let reserved = 0;
  const items = [];
  for (const e of reservedMap.values()) {
    reserved += e.total;
    items.push(...e.items);
  }
  reserved = round2(reserved);
  items.sort((a, b) => a.date.localeCompare(b.date));
  return {
    has_budget: true, month, year, limit, spent, reserved,
    reserved_items: items.slice(0, 10),
    categories,
    available: round2(limit - spent - reserved),
  };
}

module.exports = {
  spendableFor, reservedByCategory, groupItems, lumpyCategories, paceStatus, elapsedPct, pendingOccurrences,
  PAY_STYLES, PACE_CAREFUL, LUMPY_MAX_COUNT,
};
