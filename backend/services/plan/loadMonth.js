// โหลดรายการของเดือนที่ดู + 3 เดือนก่อนหน้า แล้ววิเคราะห์ (ใช้ร่วมกันระหว่างหน้าวางแผน และการแจ้งเตือนหมวดสูงผิดปกติ)
const Category = require('../../models/Category');
const Transaction = require('../../models/Transaction');
const Recurring = require('../../models/Recurring');
const { analyze } = require('./analysis');
const { bangkokToday, monthKeyOf, parseMonthKey, addMonths } = require('./dateUtil');

const MAX_TXNS = 20000;

async function analyzeMonth(userId, monthParam) {
  const todayIso = bangkokToday();
  const pm = parseMonthKey(monthParam) || parseMonthKey(todayIso.slice(0, 7));
  const base = addMonths(pm.year, pm.month, -3);
  const from = new Date(Date.UTC(base.year, base.month - 1, 1));
  const to = new Date(Date.UTC(pm.year, pm.month, 1));
  const [txns, cats] = await Promise.all([
    Transaction.find({ user: userId, date: { $gte: from, $lt: to } }).select('date type amount category note recurring installment').limit(MAX_TXNS).lean(),
    Category.find({ $or: [{ user: null }, { user: userId }] }).lean(),
  ]);
  // ค่าประจำที่รู้แน่นอน: งวดผ่อน และรายการเกิดซ้ำรายเดือน/รายปี (รายวัน/รายสัปดาห์ เช่น ค่าข้าว ยังนับเป็นพฤติกรรมการใช้จ่าย)
  const recIds = [...new Set(txns.filter((t) => t.recurring).map((t) => String(t.recurring)))];
  const recs = recIds.length ? await Recurring.find({ _id: { $in: recIds }, user: userId }).select('frequency').lean() : [];
  const fixedRec = new Set(recs.filter((r) => r.frequency === 'monthly' || r.frequency === 'yearly').map((r) => String(r._id)));
  const marked = txns.map((t) => ({ date: t.date, type: t.type, amount: t.amount, category: t.category, note: t.note || '', fixed: !!t.installment || (t.recurring && fixedRec.has(String(t.recurring))), installment_paid: !!t.installment }));
  const analysis = analyze({ txns: marked, categories: cats, todayIso, month: monthKeyOf(pm.year, pm.month) });
  return { todayIso, pm, analysis };
}

module.exports = { analyzeMonth, MAX_TXNS };
