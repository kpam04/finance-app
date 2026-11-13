// ตรวจจับการใช้จ่ายผิดปกติ (สถิติล้วน ไม่ใช้ AI เทียบกับข้อมูลของผู้ใช้คนนั้นเองเสมอ)
//  ก) รายการเดียวแพงผิดปกติ: เทียบรายการในหมวดเดียวกันย้อนหลัง 90 วัน (มัธยฐาน + IQR)
//     เกณฑ์ = max(Q3 + 3×IQR, มัธยฐาน × 3) / ไม่ตรวจหมวดที่มีไม่ถึง 10 รายการใน 90 วัน (รวมหมวดจ่ายเป็นก้อน) หรือข้อมูลยังไม่ถึง 2 เดือน
//     นับทุกรายการตามจริง (มัธยฐาน/IQR ทนต่อค่าโดด ๆ อยู่แล้ว และถ้าพฤติกรรมเปลี่ยนจริง เกณฑ์จะขยับตามเอง)
//     ไม่นับรายการที่ระบบสร้างจากรายการเกิดซ้ำ/งวดผ่อน (ยอดตายตัว ไม่ใช่พฤติกรรม)
//  ข) ยอดทั้งเดือนของหมวดสูงผิดปกติ: ใช้ตัวเลขเดียวกับหน้าวางแผน (ระดับปกติถึงวันนี้)
//     แจ้งกระดิ่งเมื่อ ≥ 1.5 เท่า และเกินอย่างน้อย ฿200 (เดือนผ่านไป ≥ 7 วัน) เดือนละครั้งต่อหมวด + อีกครั้งเมื่อถึง 2 เท่า
const DAY = 86400000;
const WINDOW_DAYS = 90;
const MIN_ROWS = 10;
const MIN_HISTORY_DAYS = 60;
const IQR_K = 3;
const MEDIAN_K = 3;
const SPIKE_LEVELS = [2, 1.5]; // ตรวจระดับสูงก่อน
const SPIKE_MIN_EXCESS = 200;
const SPIKE_MIN_DAYS = 7;

// ควอร์ไทล์แบบประมาณค่าเชิงเส้น (ข้อมูลเรียงจากน้อยไปมากแล้ว)
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const round2 = (n) => Math.round(n * 100) / 100;

// txns: รายจ่ายของผู้ใช้ [{ date, amount, category, recurring?, installment? }] / firstIso: วันที่รายการแรกของผู้ใช้ / todayIso
// คืน { [category_id]: { median, q1, q3, threshold, n } } เฉพาะหมวดที่ข้อมูลพอ
function categoryStats({ txns = [], firstIso, todayIso }) {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (!firstIso || (today - Date.parse(`${firstIso}T00:00:00Z`)) / DAY < MIN_HISTORY_DAYS) return {};
  const by = new Map();
  for (const t of txns) {
    if (t.recurring || t.installment || !(t.amount > 0)) continue;
    const age = (today - new Date(t.date).getTime()) / DAY;
    if (age < 0 || age > WINDOW_DAYS) continue;
    const k = String(t.category);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(t.amount);
  }
  const out = {};
  for (const [k, list] of by) {
    if (list.length < MIN_ROWS) continue;
    list.sort((a, b) => a - b);
    const q1 = quantile(list, 0.25);
    const median = quantile(list, 0.5);
    const q3 = quantile(list, 0.75);
    const threshold = Math.max(q3 + IQR_K * (q3 - q1), median * MEDIAN_K);
    out[k] = { median: round2(median), q1: round2(q1), q3: round2(q3), threshold: round2(threshold), n: list.length };
  }
  return out;
}

async function statsFor(userId, todayIso) {
  const Transaction = require('../models/Transaction');
  const since = new Date(Date.parse(`${todayIso}T00:00:00Z`) - WINDOW_DAYS * DAY);
  const [txns, first] = await Promise.all([
    Transaction.find({ user: userId, type: 'expense', date: { $gte: since } }).select('date amount category recurring installment').lean(),
    Transaction.findOne({ user: userId }).sort({ date: 1 }).select('date').lean(),
  ]);
  const firstIso = first ? new Date(first.date).toISOString().slice(0, 10) : null;
  return categoryStats({ txns, firstIso, todayIso });
}

// ข) ตรวจหมวดเดียวหลังบันทึกรายจ่าย แล้วแจ้งกระดิ่ง (กันซ้ำด้วย key: เดือน + ระดับ)
const baht = (n) => `฿${Math.round(n).toLocaleString('th-TH')}`;
const timesText = (r) => `${(Math.round(r * 10) / 10).toLocaleString('th-TH')} เท่า`;
function spikeLevel(c, daysElapsed) {
  if (!c || c.expected_to_date === null || !(c.expected_to_date > 0) || daysElapsed < SPIKE_MIN_DAYS) return null;
  const ratio = c.amount / c.expected_to_date;
  if (c.amount - c.expected_to_date < SPIKE_MIN_EXCESS) return null;
  const lv = SPIKE_LEVELS.find((l) => ratio >= l);
  return lv ? { level: lv, ratio } : null;
}

async function checkCategorySpike(userId, categoryId) {
  const Notification = require('../models/Notification');
  const { analyzeMonth } = require('./plan/loadMonth');
  const { analysis } = await analyzeMonth(userId);
  const c = (analysis.categories || []).find((x) => String(x.category_id) === String(categoryId));
  const hit = spikeLevel(c, analysis.days_elapsed ?? (analysis.data && analysis.data.days_elapsed) ?? 0);
  if (!hit) return null;
  const key = `spike:${categoryId}:${analysis.month}:${hit.level}`;
  // ถึง 2 เท่าแล้ว ไม่ต้องแจ้งระดับ 1.5 ซ้ำ
  if (hit.level === 1.5) {
    const higher = await Notification.exists({ user: userId, key: `spike:${categoryId}:${analysis.month}:2` });
    if (higher) return null;
  }
  const message = `หมวด “${c.name}” เดือนนี้ใช้ไป ${baht(c.amount)} สูงกว่าปกติถึงวันนี้ราว ${timesText(hit.ratio)} (ปกติ ${baht(c.expected_to_date)})`;
  try {
    const r = await Notification.updateOne({ user: userId, key }, { $setOnInsert: { user: userId, key, kind: 'spike', message, isRead: false } }, { upsert: true });
    return r.upsertedCount ? key : null;
  } catch (e) {
    if (e.code === 11000) return null;
    throw e;
  }
}

module.exports = { categoryStats, statsFor, quantile, spikeLevel, checkCategorySpike, WINDOW_DAYS, MIN_ROWS };
