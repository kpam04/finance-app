const Installment = require('../models/Installment');
const Notification = require('../models/Notification');
const { billsOf } = require('./installments');
const { todayTH } = require('./recurringRunner');

// แจ้งเตือนบิลผ่อนในกระดิ่ง: 3 วันก่อนครบกำหนด (ถ้าระบบหยุดไป เตือนเมื่อเหลือ 1–3 วัน) และวันครบกำหนด บิลละครั้งต่อช่วง
// กันซ้ำด้วย key ของการแจ้งเตือน (unique ต่อผู้ใช้) จ่ายแล้วก่อนถึงวันเตือน = ไม่มีบิลค้าง จึงไม่เตือน
const SOON_DAYS = 3;
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (iso, n) => isoOf(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000));
const thaiDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const baht = (n) => `฿${(Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

function messagesFor(plans, todayIso) {
  const out = [];
  for (const b of billsOf(plans, todayIso, { until: addDays(todayIso, SOON_DAYS) })) {
    if (b.days < 0) continue; // ค้างชำระ: หน้าเว็บแสดงอยู่แล้ว ไม่เตือนซ้ำทุกวัน
    const stage = b.days === 0 ? 'due' : 'soon';
    const message = stage === 'due'
      ? `บิล ${b.channel_label} ${baht(b.total)} ครบกำหนดวันนี้ (${thaiDay(b.due_date)})`
      : `บิล ${b.channel_label} ${baht(b.total)} ครบกำหนดอีก ${b.days} วัน (${thaiDay(b.due_date)})`;
    out.push({ key: `inst:${b.key}:${stage}`, message });
  }
  return out;
}

// options: { userId } (ไม่ใส่ = ทุกผู้ใช้) คืน { users, created, errors }
async function runInstallmentReminders({ userId, today } = {}) {
  const todayIso = isoOf(today || todayTH());
  const q = { status: 'active' };
  if (userId) q.user = userId;
  const plans = await Installment.find(q).lean();
  const byUser = new Map();
  for (const p of plans) {
    const k = String(p.user);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(p);
  }
  let created = 0;
  const errors = [];
  for (const [user, list] of byUser) {
    for (const m of messagesFor(list, todayIso)) {
      try {
        const r = await Notification.updateOne(
          { user, key: m.key },
          { $setOnInsert: { user, key: m.key, kind: 'installment', message: m.message, isRead: false } },
          { upsert: true },
        );
        if (r.upsertedCount) created += 1;
      } catch (e) {
        if (e.code !== 11000) errors.push(`ผู้ใช้ ${user.slice(-6)}: ${e.message}`.slice(0, 200));
      }
    }
  }
  return { users: byUser.size, created, errors };
}

module.exports = { runInstallmentReminders, messagesFor, SOON_DAYS };
