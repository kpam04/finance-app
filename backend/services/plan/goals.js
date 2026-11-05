const { dayDiff, addDaysIso } = require('./dateUtil');

// ประเมินเป้าหมายการออม: เทียบ "ที่ต้องออมต่อเดือน" กับ "ที่ออมได้จริงโดยเฉลี่ย" (ส่วนเกินรายรับ-รายจ่ายเฉลี่ยของเดือนอ้างอิง)
const DAYS_PER_MONTH = 30.4375;
const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;

// goal: { target_amount, saved_amount, target_date: 'YYYY-MM-DD' } / surplus: ส่วนเกินเฉลี่ยต่อเดือน (null = ยังประเมินไม่ได้)
function evaluateGoal(goal, { surplus, todayIso }) {
  const target = Number(goal.target_amount);
  const saved = Number(goal.saved_amount) || 0;
  const remaining = Math.max(0, Math.round((target - saved) * 100) / 100);
  const progress = target > 0 ? round1(Math.min(100, (saved / target) * 100)) : 0;
  const base = { remaining: Math.round(remaining), progress_pct: progress, days_left: null, months_left: null, required_monthly: null, capacity_monthly: null, status: 'unknown', eta_date: null, eta_months: null, delay_months: null, shortfall_monthly: null };
  if (remaining <= 0) return { ...base, remaining: 0, progress_pct: 100, status: 'reached' };

  const daysLeft = dayDiff(todayIso, goal.target_date);
  const monthsLeft = daysLeft / DAYS_PER_MONTH;
  const out = { ...base, days_left: daysLeft, months_left: round1(Math.max(0, monthsLeft)) };
  // เหลือไม่ถึงเดือน คิดว่าต้องออมทั้งหมดภายใน 1 เดือน (ไม่หารด้วยเศษเดือนจนได้ตัวเลขสูงเกินจริง)
  out.required_monthly = Math.ceil(remaining / Math.max(monthsLeft, 1));
  if (surplus === null || surplus === undefined || !Number.isFinite(surplus)) return { ...out, status: daysLeft <= 0 ? 'overdue' : 'unknown' };

  const capacity = Math.max(0, Math.round(surplus));
  out.capacity_monthly = capacity;
  if (capacity <= 0) return { ...out, status: daysLeft <= 0 ? 'overdue' : 'no_surplus' };

  const etaMonths = remaining / capacity;
  out.eta_months = round1(etaMonths);
  out.eta_date = addDaysIso(todayIso, Math.ceil(etaMonths * DAYS_PER_MONTH));
  if (daysLeft <= 0) return { ...out, status: 'overdue' };
  if (capacity >= out.required_monthly) return { ...out, status: 'on_track' };
  return { ...out, status: 'behind', delay_months: round1(Math.max(0, etaMonths - monthsLeft)), shortfall_monthly: out.required_monthly - capacity };
}

module.exports = { evaluateGoal, DAYS_PER_MONTH };
