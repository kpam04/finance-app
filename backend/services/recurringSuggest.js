// ค้นหารายจ่ายประจำที่ซ่อนอยู่: รายการที่ผู้ใช้จดเองทุกเดือน แต่ยังไม่ได้ตั้งเป็นรายการเกิดซ้ำ (สถิติล้วน ไม่ใช้ AI)
//  เงื่อนไข (ครบทุกข้อ):
//   - รายจ่าย หมวดเดียวกัน + บันทึกช่วยจำคล้ายกัน (ตัดช่องว่าง/ตัวพิมพ์ใหญ่เล็ก/คำว่า "ค่า" นำหน้า) — ต้องมีบันทึกช่วยจำ
//   - ยอดต่างจากยอดล่าสุดไม่เกิน ±10% / ห่างกันครั้งละ 25–35 วัน
//   - เดือนละครั้ง (ช่วงนั้นมีรายการเดียวกันแทรก = ไม่ใช่) / ติดกันอย่างน้อย 3 ครั้ง (ชื่อบริการ เช่น Netflix/Spotify = 2 ครั้ง ตรงกับการเดาค่าประจำในหน้าวางแผน)
//   - ครั้งล่าสุดไม่เกิน 40 วันก่อนวันนี้ (เลิกจ่ายไปแล้วไม่ชวน)
//   - ไม่ใช่รายการที่ระบบสร้างจากรายการเกิดซ้ำ/งวดผ่อน, ยังไม่มีรายการเกิดซ้ำรายเดือนที่ตรงกัน (รวมที่ปิดใช้อยู่)
//   - ลบรายการเกิดซ้ำเอง = นับเหมือนตอบ "ไม่ใช่" (routes/recurring.js) ไม่ชวนอีก
//  ตอบ "ไม่ใช่" แล้ว: ไม่ชวนกลุ่มนั้นอีกเลย
//  ค่าที่เสนอ: วันที่ = วันที่ที่พบบ่อยที่สุด (เท่ากันใช้ของครั้งล่าสุด), ยอด = ยอดล่าสุด,
//              วันเริ่ม = รอบถัดไปหลังครั้งล่าสุด (จดเดือนนี้ไปแล้ว → เริ่มเดือนหน้า ไม่บันทึกซ้ำ)
const SUB_WORDS = /netflix|spotify|youtube|icloud|disney|prime\s*video|google\s*one|apple\s*(music|one|tv)|viu|wetv|iqiyi|trueid|true\s*id|hbo|max\b|canva|chatgpt|ฟิตเนส|fitness|gym|ยิม|ค่าเน็ต|อินเทอร์เน็ต|internet|wifi|ค่าโทร|ค่ามือถือ|รายเดือน|สมาชิก|subscription/i;
const AMOUNT_TOL = 0.10;
const GAP_MIN = 25;
const GAP_MAX = 35;
const MIN_COUNT = 3;
const MIN_COUNT_SUB = 2;
const MAX_AGE_DAYS = 40;
const LOOKBACK_DAYS = 400;
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayNum = (iso) => Date.parse(`${iso}T00:00:00Z`) / DAY;

// "ค่า Netflix " → "netflix" / "ค่าอินเทอร์เน็ต" → "อินเทอร์เน็ต"
function normNote(note) {
  return String(note || '').toLowerCase().replace(/\s+/g, '').replace(/^ค่า/, '');
}
const keyOf = (categoryId, note) => `${categoryId}|${normNote(note)}`;
const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * AMOUNT_TOL;

// วันเริ่มรอบถัดไป: เดือนถัดจากครั้งล่าสุด ใช้วันที่ที่พบบ่อย (เดือนสั้นใช้วันสุดท้ายของเดือน)
function nextStart(lastIso, day) {
  const [y, m] = lastIso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return isoOf(new Date(Date.UTC(y, m, Math.min(day, last))));
}

// txns: [{ date, amount, note, category, type, recurring?, installment? }] (ของผู้ใช้คนเดียว)
// recurrings: [{ category, note, amount, frequency, isActive }] / dismissed: Set ของ key / todayIso: 'YYYY-MM-DD'
function findSuggestions({ txns = [], recurrings = [], dismissed = new Set(), categories = [], todayIso }) {
  const today = dayNum(todayIso);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const groups = new Map();
  for (const t of txns) {
    if (t.type !== 'expense' || t.recurring || t.installment) continue;
    const n = normNote(t.note);
    if (!n) continue;
    const iso = isoOf(new Date(t.date));
    if (today - dayNum(iso) > LOOKBACK_DAYS || dayNum(iso) > today) continue;
    const k = `${String(t.category)}|${n}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ iso, amount: t.amount, note: String(t.note || '').trim(), category: String(t.category) });
  }
  // รวมรายการที่ผู้ใช้ปิดใช้ชั่วคราวด้วย (ปิดเอง = ตั้งใจแล้ว ไม่ต้องชวน)
  const active = recurrings.filter((r) => r.frequency === 'monthly');
  const out = [];
  for (const [key, list] of groups) {
    if (dismissed.has(key)) continue;
    list.sort((a, b) => a.iso.localeCompare(b.iso));
    const latest = list[list.length - 1];
    if (today - dayNum(latest.iso) > MAX_AGE_DAYS) continue;
    // ไล่ย้อนจากครั้งล่าสุด: ห่างกัน 25–35 วัน และยอดใกล้ยอดล่าสุด (วันเดียวกันมีหลายรายการ = นับครั้งเดียว ใช้รายการที่ยอดใกล้สุด)
    const chain = [latest];
    let prev = latest;
    for (let i = list.length - 2; i >= 0; i -= 1) {
      const r = list[i];
      const gap = dayNum(prev.iso) - dayNum(r.iso);
      if (gap < GAP_MIN) continue;
      if (gap > GAP_MAX) break;
      if (!near(r.amount, latest.amount)) break;
      chain.push(r);
      prev = r;
    }
    const need = SUB_WORDS.test(latest.note) ? MIN_COUNT_SUB : MIN_COUNT;
    if (chain.length < need) continue;
    // ช่วงเดียวกันมีรายการอื่นแทรก (เช่น กาแฟหลายครั้งต่อเดือน) → ไม่ใช่รายจ่ายรายเดือน
    const firstIso = chain[chain.length - 1].iso;
    if (list.filter((r) => r.iso >= firstIso && r.iso <= latest.iso).length > chain.length) continue;
    // ตั้งรายการเกิดซ้ำไว้แล้ว (หมวดเดียวกัน + บันทึกช่วยจำตรงกัน หรือยอดใกล้กัน) → ไม่ชวน
    if (active.some((r) => String(r.category) === latest.category && (normNote(r.note) === normNote(latest.note) || near(r.amount, latest.amount)))) continue;
    const counts = new Map();
    for (const r of chain) { const d = Number(r.iso.slice(8, 10)); counts.set(d, (counts.get(d) || 0) + 1); }
    const latestDay = Number(latest.iso.slice(8, 10));
    const day = [...counts.entries()].sort((a, b) => b[1] - a[1] || (b[0] === latestDay) - (a[0] === latestDay))[0][0];
    const first = chain[chain.length - 1];
    out.push({
      key,
      note: latest.note,
      category_id: latest.category,
      category_name: catName.get(latest.category) || '',
      amount: latest.amount,
      day,
      count: chain.length,
      first_date: first.iso,
      last_date: latest.iso,
      start_date: nextStart(latest.iso, day),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// โหลดข้อมูลจากฐานข้อมูลแล้วหาคำแนะนำของผู้ใช้หนึ่งคน
async function suggestionsFor(userId, todayIso) {
  const Transaction = require('../models/Transaction');
  const Recurring = require('../models/Recurring');
  const Category = require('../models/Category');
  const RecurringDismiss = require('../models/RecurringDismiss');
  const since = new Date(Date.parse(`${todayIso}T00:00:00Z`) - LOOKBACK_DAYS * DAY);
  const [txns, recurrings, dis, categories] = await Promise.all([
    Transaction.find({ user: userId, type: 'expense', date: { $gte: since }, note: { $nin: ['', null] } }).select('date amount note category type recurring installment').lean(),
    Recurring.find({ user: userId }).select('category note amount frequency isActive').lean(),
    RecurringDismiss.find({ user: userId }).select('key').lean(),
    Category.find({ $or: [{ user: null }, { user: userId }] }).select('name').lean(),
  ]);
  return findSuggestions({ txns, recurrings, dismissed: new Set(dis.map((d) => d.key)), categories, todayIso });
}

const baht = (n) => `฿${(Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

// แจ้งกระดิ่งครั้งเดียวต่อกลุ่ม (กันซ้ำด้วย key) คืนจำนวนที่สร้างใหม่
async function notifySuggestions(userId, list) {
  const Notification = require('../models/Notification');
  let created = 0;
  for (const s of list) {
    const key = `recsug:${s.key}`.slice(0, 220);
    try {
      const r = await Notification.updateOne(
        { user: userId, key },
        { $setOnInsert: { user: userId, key, kind: 'recurring', isRead: false, message: `พบรายจ่ายที่น่าจะเป็นรายการประจำ: ${s.note} ${baht(s.amount)} ทุกวันที่ ${s.day} ตั้งเป็นรายการเกิดซ้ำไหม?` } },
        { upsert: true },
      );
      if (r.upsertedCount) created += 1;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  return created;
}

// งานประจำวัน: ตรวจผู้ใช้ที่มีรายจ่ายพร้อมบันทึกช่วยจำใน 40 วันล่าสุด แล้วแจ้งกลุ่มที่พบใหม่ คืน { users, created, errors }
async function runSuggestionNotices({ todayIso } = {}) {
  const Transaction = require('../models/Transaction');
  const { todayTH } = require('./recurringRunner');
  const iso = todayIso || isoOf(todayTH());
  const since = new Date(Date.parse(`${iso}T00:00:00Z`) - MAX_AGE_DAYS * DAY);
  const users = await Transaction.distinct('user', { type: 'expense', date: { $gte: since }, note: { $nin: ['', null] }, recurring: null, installment: null });
  let created = 0;
  const errors = [];
  for (const u of users) {
    try {
      created += await notifySuggestions(u, await suggestionsFor(u, iso));
    } catch (e) {
      errors.push(`ผู้ใช้ ${String(u).slice(-6)}: ${e.message}`.slice(0, 200));
    }
  }
  return { users: users.length, created, errors };
}

module.exports = { findSuggestions, suggestionsFor, notifySuggestions, runSuggestionNotices, normNote, keyOf, nextStart, SUB_WORDS };
