const I = require('../installments');
const { addMonths, monthKeyOf } = require('./dateUtil');

// ตัวเลขรายการผ่อนสำหรับหน้าวางแผน (เฉพาะเดือนปัจจุบัน)
//  load       = ภาระผ่อนต่อเดือน (ยอดงวดถัดไปของทุกรายการที่กำลังผ่อน)
//  burden_pct = load เทียบรายรับอ้างอิง (%)
//  free       = รายการที่งวดสุดท้ายครบกำหนดภายในเดือนนี้หรือเดือนหน้า → หลังจากนั้นจะมีเงินเหลือเพิ่มต่อเดือน
//               { amount: ยอดงวดปกติรวม, month: 'YYYY-MM' เดือนแรกที่ไม่ต้องจ่ายแล้วครบทุกรายการ, n, name }
const FREE_WITHIN_MONTHS = 2;
const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;

function installmentFacts(plans, todayIso, incomeRef) {
  const active = (plans || []).filter((p) => p.status === 'active');
  if (active.length === 0) return { load: 0, burden_pct: null, free: null, count: 0 };
  const { monthly_load: load } = I.summaryOf(active, todayIso);
  const [y, m] = todayIso.split('-').map(Number);
  const lastOk = (() => { const a = addMonths(y, m, FREE_WITHIN_MONTHS - 1); return monthKeyOf(a.year, a.month); })();
  const ending = [];
  for (const p of active) {
    const open = I.effectiveSchedule(p).items.filter(I.isOpenItem);
    if (open.length === 0) continue;
    const lastMonth = open[open.length - 1].due_date.slice(0, 7);
    if (lastMonth > lastOk) continue;
    const regular = p.schedule && p.schedule.length ? Number(p.schedule[0].amount) : open[0].amount;
    const [ly, lm] = lastMonth.split('-').map(Number);
    const nx = addMonths(ly, lm, 1);
    ending.push({ name: p.name, amount: regular, month: monthKeyOf(nx.year, nx.month) });
  }
  const free = ending.length
    ? { amount: I.round2(ending.reduce((s, e) => s + e.amount, 0)), month: ending.map((e) => e.month).sort().pop(), n: ending.length, name: ending[0].name }
    : null;
  return { load: I.round2(load), burden_pct: incomeRef > 0 && load > 0 ? round1((load / incomeRef) * 100) : null, free, count: active.length };
}

module.exports = { installmentFacts, FREE_WITHIN_MONTHS };
