const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { ensureCurrentMonth, thaiPeriod } = require('./budgetCarry');
const { forecastFor } = require('./budgetForecast');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const pct1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// ระดับตามสัดส่วนที่ใช้ไป: 0 ปกติ, 1 ถึงเกณฑ์ที่ตั้ง (เช่น 80%), 2 ถึงหรือเกิน 100%
function levelFor(usedPct, threshold) {
  if (usedPct >= 100) return 2;
  if (usedPct >= threshold) return 1;
  return 0;
}

function buildMessage(level, name, usedPct, threshold) {
  if (level === 2) return `หมวด "${name}" ใช้จ่ายถึงหรือเกินวงเงินงบประมาณแล้ว (${pct1(usedPct)}%)`;
  return `หมวด "${name}" ใช้จ่ายถึง ${pct1(usedPct)}% ของงบประมาณแล้ว (เกณฑ์แจ้งเตือน ${threshold}%)`;
}

async function spentFor(userId, categoryId, month, year) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [row] = await Transaction.aggregate([
    { $match: { user: oid(userId), category: oid(categoryId), type: 'expense', date: { $gte: start, $lt: end } } },
    { $group: { _id: null, spent: { $sum: '$amount' } } },
  ]);
  return row ? row.spent : 0;
}

// ปรับระดับของงบหนึ่งรายการให้ตรงกับยอดใช้จ่ายปัจจุบัน
//  - ระดับเพิ่มขึ้น  : แจ้งเตือน 1 ครั้งต่อระดับ (ข้ามระดับ 1 ไประดับ 2 ในรายการเดียว = แจ้งระดับ 2 อย่างเดียว) เมื่อ notify = true
//  - ระดับลดลง      : รีเซ็ตแบบเงียบ ๆ (ลบ/แก้รายการ หรือขยายวงเงิน) ถ้ายอดข้ามขึ้นไปอีกค่อยแจ้งใหม่
//  - ระดับเท่าเดิม    : ไม่ทำอะไร (ไม่แจ้งซ้ำทุกรายการ)
async function syncBudget(budget, { notify = true, now = Date.now() } = {}) {
  if (!budget || !(budget.amountLimit > 0)) return { level: 0, changed: false, notified: false };

  // งบที่ปิดไว้เดือนนี้หรือหยุดใช้แล้ว: ไม่คำนวณและไม่แจ้งเตือน (รีเซ็ตระดับเงียบ ๆ)
  if (budget.enabled === false || budget.stopped === true) {
    const had = (budget.alertLevel || 0) !== 0;
    if (had) await Budget.updateOne({ _id: budget._id }, { $set: { alertLevel: 0 } });
    return { level: 0, changed: had, notified: false };
  }

  const spent = await spentFor(budget.user, budget.category, budget.month, budget.year);
  const usedPct = (spent / budget.amountLimit) * 100;
  const level = levelFor(usedPct, budget.alertThreshold);
  const stored = budget.alertLevel || 0;
  if (level === stored) {
    const forecasted = level === 0 && notify ? await maybeForecastAlert(budget, now) : false;
    return { level, changed: false, notified: forecasted, usedPct };
  }

  let notified = false;
  if (level > stored && notify) {
    const cat = await Category.findById(budget.category).lean();
    const name = cat ? cat.name : 'ไม่ทราบหมวด';
    await Notification.create({
      user: budget.user,
      budget: budget._id,
      kind: 'level',
      level,
      message: buildMessage(level, name, usedPct, budget.alertThreshold),
    });
    notified = true;
  }
  await Budget.updateOne({ _id: budget._id }, { $set: { alertLevel: level } });
  // ลดจากระดับสูงลงมาเป็น 0 (รีเซ็ตเงียบ) ยังต้องตรวจพยากรณ์ต่อ ถ้ายังไม่เคยเตือน
  const forecasted = level === 0 && notify ? await maybeForecastAlert(budget, now) : false;
  return { level, changed: true, notified: notified || forecasted, usedPct };
}

// แจ้งเตือนเชิงพยากรณ์ "ที่ความเร็วนี้คาดว่าจะใช้ถึงวงเงิน" ครั้งเดียวต่องบต่อเดือน
// เงื่อนไข: ยอดจริงยังไม่ถึงเกณฑ์ระดับ 1, ผ่านเงื่อนไขขั้นต่ำของการพยากรณ์ (7 วัน + 3 รายการ), คาดว่าจะเกินวงเงิน, ยังไม่เคยเตือนพยากรณ์ของงบนี้
async function maybeForecastAlert(budget, now) {
  if (budget.forecastNotified === true) return false;
  const f = await forecastFor(budget, { now });
  if (!f || !f.will_exceed) return false;
  const cat = await Category.findById(budget.category).lean();
  const name = cat ? cat.name : 'ไม่ทราบหมวด';
  const day = f.reach_day ? ` ประมาณวันที่ ${f.reach_day}` : '';
  await Notification.create({
    user: budget.user,
    budget: budget._id,
    kind: 'forecast',
    message: `หมวด "${name}" ที่ความเร็วนี้ คาดว่าจะใช้ถึงวงเงิน${day} (คาดการณ์สิ้นเดือน ฿${Math.round(f.projected).toLocaleString('en-US')})`,
  });
  await Budget.updateOne({ _id: budget._id }, { $set: { forecastNotified: true } });
  return true;
}

// เรียกหลังเพิ่ม/แก้/ลบรายจ่าย (และตอนระบบสร้างรายการซ้ำ) ความล้มเหลวของการแจ้งเตือนต้องไม่ทำให้การบันทึกรายการล้มเหลว
async function checkBudgetAlert(userId, categoryId, date, { now = Date.now() } = {}) {
  try {
    const d = new Date(date);
    // รายการของเดือนปัจจุบัน: สร้างงบเดือนนี้จากเดือนก่อน (ถ้ายังไม่มี) เพื่อให้แจ้งเตือนทำงานแม้ผู้ใช้ยังไม่เปิดหน้างบประมาณ
    const cur = thaiPeriod(now);
    if (d.getUTCMonth() + 1 === cur.month && d.getUTCFullYear() === cur.year) {
      await ensureCurrentMonthBudgets(userId, { now });
    }
    const budget = await Budget.findOne({
      user: userId, category: categoryId, month: d.getUTCMonth() + 1, year: d.getUTCFullYear(),
    });
    if (!budget) return;
    await syncBudget(budget, { notify: true, now });
  } catch (e) {
    console.error('checkBudgetAlert error:', e.message);
  }
}

// สร้างงบเดือนปัจจุบันจากเดือนก่อน แล้วคำนวณระดับแจ้งเตือนของงบที่สร้างใหม่ (ยอดอาจใช้ไปแล้วก่อนมีงบ)
async function ensureCurrentMonthBudgets(userId, { now = Date.now() } = {}) {
  const created = await ensureCurrentMonth(userId, { now });
  for (const b of created) {
    try {
      await syncBudget(b, { notify: true, now });
    } catch (e) {
      console.error('syncBudget(new month) error:', e.message);
    }
  }
  return created;
}

module.exports = checkBudgetAlert;
module.exports.ensureCurrentMonthBudgets = ensureCurrentMonthBudgets;
module.exports.syncBudget = syncBudget;
module.exports.levelFor = levelFor;
module.exports.buildMessage = buildMessage;
