// คำนวณเรื่องรายการผ่อน (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ทดสอบได้ง่าย)
//  - วันครบกำหนดของแต่ละงวด / สร้างตารางงวด / ยอดงวดที่ยังไม่จ่าย (ปรับส่วนต่างที่งวดท้าย)
//  - รวมบิลตามช่องทาง + วันครบกำหนด / สรุปของเดือน / รายการที่ต้องกันเงินในงบ

const CHANNELS = {
  spaylater: 'SPayLater',
  lazpaylater: 'LazPayLater',
  tiktok: 'TikTok PayLater',
  credit_card: 'บัตรเครดิต',
  store: 'ผ่อนกับร้านค้า',
  other: 'อื่น ๆ',
};
const MAX_MONTHS = 60;
const MAX_ACTIVE_PLANS = 30;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ชื่อช่องทางที่แสดง เช่น "บัตรเครดิต KBank" / "SPayLater"
function channelLabel(plan) {
  const base = CHANNELS[plan.channel] || 'อื่น ๆ';
  const extra = (plan.channel_name || '').trim();
  if (!extra) return base;
  return plan.channel === 'other' ? extra : `${base} ${extra}`;
}
// ใช้แยกบิล: ช่องทางเดียวกัน + ชื่อเดียวกัน (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง) = บิลเดียวกัน
const channelKey = (plan) => `${plan.channel}:${(plan.channel_name || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

// วันครบกำหนดของงวดที่ n (1 = งวดแรก) 'YYYY-MM-DD' ถ้าเดือนนั้นวันไม่ถึง ใช้วันสุดท้ายของเดือน
function dueDateOf(plan, n) {
  const [y0, m0] = plan.first_month.split('-').map(Number);
  const idx = y0 * 12 + (m0 - 1) + (n - 1);
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(plan.due_day, daysIn(y, m)))}`;
}

// ตารางงวดตามตาราง (ยังไม่สนการจ่าย)
//  equal: ทุกงวด = per ถ้ากรอกยอดรวม งวดสุดท้าย = ยอดรวม − per × (months − 1)
//  ไม่ equal: ใช้ amounts ที่ผู้ใช้กรอกทีละงวด
function buildAmounts({ months, per, total, equal, amounts }) {
  if (!equal) return amounts.map(round2);
  const out = Array.from({ length: months }, () => round2(per));
  if (total !== null && total !== undefined) out[months - 1] = round2(total - per * (months - 1));
  return out;
}

// ตรวจตารางงวด คืนข้อความเตือน (ไม่ใช่ข้อผิดพลาด) เช่น งวดสุดท้ายต่างจากงวดอื่นมาก
function scheduleWarnings(amounts) {
  const w = [];
  if (amounts.length >= 2) {
    const last = amounts[amounts.length - 1];
    const per = amounts[0];
    if (per > 0 && Math.abs(last - per) / per > 0.5) w.push('ยอดงวดสุดท้ายต่างจากงวดอื่นมาก ลองตรวจยอดรวมที่ต้องจ่ายอีกครั้ง');
  }
  return w;
}

// ยอดจริงของแต่ละงวด: งวดที่จ่ายแล้ว = ยอดที่จ่าย / งวดที่ยังไม่จ่าย = ยอดตามตาราง ปรับด้วยส่วนต่างของงวดที่จ่ายไปแล้ว
//  จ่ายเกิน → งวดท้ายลดลง (ถ้าติดลบ ทดไปงวดก่อนหน้า งวดที่เหลือ 0 ถือว่าครอบคลุมแล้ว ไม่ต้องจ่าย)
//  จ่ายขาด → งวดท้ายเพิ่มขึ้น
function effectiveSchedule(plan) {
  const items = plan.schedule.map((it) => ({
    n: it.n, scheduled: it.amount, paid: !!it.paid, prepaid: !!it.prepaid,
    paid_amount: it.paid ? round2(it.paid_amount !== null && it.paid_amount !== undefined ? it.paid_amount : it.amount) : null,
    paid_at: it.paid_at || null, transaction: it.transaction || null, due_date: dueDateOf(plan, it.n), amount: it.amount, payoff: !!it.payoff,
  }));
  for (const it of items) if (it.paid) it.amount = it.paid_amount;
  let diff = 0; // + = จ่ายขาด (ต้องเพิ่มที่งวดท้าย) / − = จ่ายเกิน
  for (const it of items) if (it.paid && !it.payoff) diff += it.scheduled - it.paid_amount;
  diff = round2(diff);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it = items[i];
    if (it.paid) continue;
    const v = round2(it.scheduled + diff);
    if (v < 0) { it.amount = 0; diff = v; } else { it.amount = v; diff = 0; }
  }
  for (const it of items) it.covered = !it.paid && it.amount <= 0; // จ่ายเกินจนครอบคลุมงวดนี้แล้ว
  return { items, leftover: diff }; // leftover > 0 = ไม่มีงวดที่ยังไม่จ่ายให้ปรับยอดขาด
}

const isOpenItem = (it) => !it.paid && !it.covered;

// ดอกเบี้ยจริงโดยประมาณต่อปี (%): หา r ที่ทำให้ Σ ยอดงวดที่ k / (1+r)^k = ราคา − เงินดาวน์ (งวดแรกจ่าย 1 เดือนหลังซื้อ)
//  แล้วแปลงเป็นต่อปี (1+r)^12 − 1 / จ่ายรวมไม่เกินยอดที่ผ่อน = 0 (ผ่อน 0%)
function aprOf(principal, amounts) {
  const p = Number(principal);
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!(p > 0) || !amounts.length || total <= p + 0.005) return 0;
  const pv = (r) => amounts.reduce((s, a, k) => s + a / (1 + r) ** (k + 1), 0);
  let lo = 0; let hi = 1; // ต่อเดือน 0–100%
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (pv(mid) > p) lo = mid; else hi = mid; }
  const r = (lo + hi) / 2;
  return Math.round(((1 + r) ** 12 - 1) * 1000) / 10;
}

// ข้อมูลแผนสำหรับส่งให้หน้าเว็บ
function planOut(plan, todayIso) {
  const { items } = effectiveSchedule(plan);
  const open = items.filter(isOpenItem);
  const paidCount = items.filter((it) => it.paid || it.covered).length;
  const totalScheduled = round2(plan.schedule.reduce((s, it) => s + it.amount, 0));
  const paidTotal = round2(items.reduce((s, it) => s + (it.paid ? it.paid_amount : 0), 0));
  const remaining = round2(open.reduce((s, it) => s + it.amount, 0));
  const next = open[0] || null;
  const totalPay = round2((plan.down_payment || 0) + totalScheduled);
  return {
    plan_id: String(plan._id), name: plan.name, channel: plan.channel, channel_name: plan.channel_name || '',
    channel_label: channelLabel(plan), category_id: String(plan.category),
    price: plan.price, down_payment: plan.down_payment || 0, months: plan.months, due_day: plan.due_day,
    first_month: plan.first_month, total_payable: plan.total_payable, equal: plan.equal !== false,
    status: plan.status, closed_at: plan.closed_at || null,
    payoff: plan.payoff ? (() => {
      const it = items.find((x) => x.payoff && x.transaction);
      const amount = it ? it.paid_amount : plan.payoff.amount;
      return { amount, remaining: plan.payoff.remaining, saved: round2(Math.max(0, plan.payoff.remaining - amount)), date: plan.payoff.date };
    })() : null,
    total_pay: totalPay, fee: round2(totalPay - plan.price),
    apr: aprOf(plan.price - (plan.down_payment || 0), plan.schedule.map((it) => it.amount)),
    monthly: open[0] ? open[0].amount : 0,
    paid_count: paidCount, paid_total: paidTotal, remaining,
    next_due: next ? { n: next.n, due_date: next.due_date, amount: next.amount, overdue: next.due_date < todayIso } : null,
    has_app_payments: items.some((it) => it.paid && !it.prepaid),
    schedule: items.map((it) => ({ n: it.n, due_date: it.due_date, amount: it.amount, scheduled: it.scheduled, paid: it.paid, prepaid: it.prepaid, paid_amount: it.paid_amount, paid_at: it.paid_at, covered: it.covered })),
  };
}

const monthEndIso = (todayIso) => {
  const [y, m] = todayIso.split('-').map(Number);
  return `${y}-${pad(m)}-${pad(daysIn(y, m))}`;
};
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// บิล = งวดที่ยังไม่จ่าย รวมตามช่องทาง + วันครบกำหนด (เฉพาะที่ครบกำหนดภายในสิ้นเดือนนี้ รวมที่ค้างชำระ)
function billsOf(plans, todayIso, { until } = {}) {
  const end = until || monthEndIso(todayIso);
  const map = new Map();
  for (const p of plans) {
    if (p.status !== 'active') continue;
    const { items } = effectiveSchedule(p);
    for (const it of items) {
      if (!isOpenItem(it) || it.due_date > end) continue;
      const key = `${channelKey(p)}|${it.due_date}`;
      const b = map.get(key) || { key, channel_label: channelLabel(p), due_date: it.due_date, total: 0, items: [] };
      b.items.push({ plan_id: String(p._id), name: p.name, n: it.n, months: p.months, amount: it.amount, category_id: String(p.category) });
      b.total = round2(b.total + it.amount);
      map.set(key, b);
    }
  }
  return [...map.values()]
    .map((b) => ({ ...b, overdue: b.due_date < todayIso, days: dayDiff(todayIso, b.due_date) }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.channel_label.localeCompare(b.channel_label));
}

// สรุปเดือนนี้: ต้องจ่าย (งวดที่ครบกำหนดเดือนนี้ + ค้างจากเดือนก่อน) / จ่ายแล้ว / ยอดคงเหลือทั้งหมด / บิลถัดไป
function summaryOf(plans, todayIso) {
  const monthKey = todayIso.slice(0, 7);
  const active = plans.filter((p) => p.status === 'active');
  let due = 0; let paid = 0; let remaining = 0;
  for (const p of active) {
    const { items } = effectiveSchedule(p);
    for (const it of items) {
      const thisMonth = it.due_date.slice(0, 7) === monthKey;
      if (it.paid && !it.prepaid && (thisMonth || (it.paid_at && new Date(it.paid_at).toISOString().slice(0, 7) === monthKey && it.due_date < `${monthKey}-01`))) {
        due += it.paid_amount; paid += it.paid_amount;
      } else if (isOpenItem(it)) {
        remaining += it.amount;
        if (thisMonth || it.due_date < `${monthKey}-01`) due += it.amount;
      }
    }
  }
  const upcoming = billsOf(active, todayIso, { until: '9999-12-31' });
  const next = upcoming[0] || null;
  // ภาระผ่อนต่อเดือน = ยอดงวดถัดไปของทุกรายการที่กำลังผ่อน
  let load = 0;
  for (const p of active) { const nx = effectiveSchedule(p).items.find(isOpenItem); if (nx) load += nx.amount; }
  return {
    monthly_load: round2(load),
    attention: upcoming.some((b) => b.overdue || b.days <= 3), // จุดที่แท็บ: ค้างชำระ หรือครบกำหนดภายใน 3 วัน
    active_count: active.length, done_count: plans.length - active.length,
    due_month: round2(due), paid_month: round2(paid), left_month: round2(due - paid), remaining: round2(remaining),
    next_bill: next ? { channel_label: next.channel_label, due_date: next.due_date, total: next.total, overdue: next.overdue, days: next.days } : null,
    has_overdue: upcoming.some((b) => b.overdue),
  };
}

// งวดที่ต้องกันเงินในงบเดือนนี้ (ยังไม่จ่าย ครบกำหนดภายในสิ้นเดือนนี้ รวมค้างชำระ) เฉพาะหมวดที่ระบุ
function reservedItems(plans, categoryIds, todayIso) {
  const want = new Set(categoryIds.map(String));
  const end = monthEndIso(todayIso);
  const out = [];
  for (const p of plans) {
    if (p.status !== 'active' || !want.has(String(p.category))) continue;
    for (const it of effectiveSchedule(p).items) {
      if (!isOpenItem(it) || it.due_date > end) continue;
      out.push({ category: String(p.category), note: `ผ่อน ${p.name}`, amount: it.amount, date: it.due_date, due: it.due_date <= todayIso });
    }
  }
  return out;
}

module.exports = {
  CHANNELS, MAX_MONTHS, MAX_ACTIVE_PLANS, aprOf, channelLabel, channelKey, dueDateOf, buildAmounts, scheduleWarnings,
  effectiveSchedule, isOpenItem, planOut, billsOf, summaryOf, reservedItems, monthEndIso, round2,
};
