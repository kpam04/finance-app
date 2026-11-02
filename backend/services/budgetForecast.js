const Transaction = require('../models/Transaction');

const WINDOW_DAYS = 14;  // อัตราการใช้จ่ายคิดจาก 14 วันล่าสุด (ถ้าเดือนนี้ผ่านมาน้อยกว่า 14 วัน คิดตั้งแต่ต้นเดือน)
const MIN_DAYS = 7;      // เริ่มประเมินเมื่อผ่านไปอย่างน้อย 7 วัน
const MIN_TX = 3;        // และมีรายจ่ายในหมวดอย่างน้อย 3 รายการ
const round2 = (n) => Math.round(n * 100) / 100;

// พยากรณ์ยอดใช้จ่ายสิ้นเดือนของงบหนึ่งรายการ (สูตรคงที่ ไม่ใช่โมเดลเรียนรู้ และไม่ใช้ LLM)
//   อัตราต่อวัน = ยอดรายจ่ายหมวดนั้นใน "14 วันล่าสุด" (รวมวันนี้) / จำนวนวันของหน้าต่าง
//   คาดการณ์สิ้นเดือน = ยอดที่ใช้ไปแล้วทั้งเดือน + อัตราต่อวัน x จำนวนวันที่เหลือ
//   วันที่คาดว่าจะถึงวงเงิน = วันนี้ + (วงเงิน - ยอดที่ใช้แล้ว) / อัตราต่อวัน
// คืน null เมื่อไม่ควรแสดง: ไม่ใช่เดือนปัจจุบัน, งบปิด/หยุดใช้, ผ่านไปไม่ถึง 7 วัน, รายจ่ายไม่ถึง 3 รายการ, ใช้ถึงวงเงินแล้ว
async function forecastFor(budget, { now = Date.now() } = {}) {
  if (!budget || !(budget.amountLimit > 0)) return null;
  if (budget.enabled === false || budget.stopped === true) return null;

  const th = new Date(now + 7 * 3600 * 1000);
  const y = th.getUTCFullYear();
  const m = th.getUTCMonth() + 1;
  const d = th.getUTCDate();
  if (budget.year !== y || budget.month !== m) return null;
  if (d < MIN_DAYS) return null;

  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));
  const rows = await Transaction.find({
    user: budget.user, category: budget.category, type: 'expense', date: { $gte: monthStart, $lt: monthEnd },
  }).lean();
  if (rows.length < MIN_TX) return null;

  const spent = rows.reduce((s, r) => s + r.amount, 0);
  if (spent >= budget.amountLimit) return null;

  const w = Math.min(WINDOW_DAYS, d);
  const winStart = Date.UTC(y, m - 1, d - w + 1);
  const winEnd = Date.UTC(y, m - 1, d + 1); // ไม่รวมรายการที่ลงวันที่ล่วงหน้า
  const windowSpent = rows
    .filter((r) => new Date(r.date).getTime() >= winStart && new Date(r.date).getTime() < winEnd)
    .reduce((s, r) => s + r.amount, 0);

  const rate = windowSpent / w;
  const projected = spent + rate * (daysInMonth - d);
  const willExceed = projected > budget.amountLimit;
  let reachDay = null;
  if (willExceed && rate > 0) {
    reachDay = Math.min(daysInMonth, d + Math.ceil((budget.amountLimit - spent) / rate));
  }
  return {
    projected: round2(projected),
    over: round2(Math.max(0, projected - budget.amountLimit)),
    will_exceed: willExceed,
    reach_day: reachDay,
    daily_rate: round2(rate),
  };
}

module.exports = { forecastFor, WINDOW_DAYS, MIN_DAYS, MIN_TX };
