const Budget = require('../models/Budget');

const periodIndex = (year, month) => year * 12 + (month - 1);
const MAX_LOOKBACK_MONTHS = 12; // ยกงบจากเดือนก่อน ๆ ได้ย้อนหลังไม่เกิน 12 เดือน (กรณีไม่ได้เปิดแอพหลายเดือน)

// เดือน/ปีปัจจุบันตามเวลาไทย (UTC+7)
function thaiPeriod(now = Date.now()) {
  const th = new Date(now + 7 * 3600 * 1000);
  return { month: th.getUTCMonth() + 1, year: th.getUTCFullYear() };
}

// สร้างงบของ "เดือนปัจจุบัน" จากงบล่าสุดของเดือนก่อน ๆ ในหมวดเดียวกัน (ผู้ใช้ไม่ต้องตั้งใหม่ทุกเดือน)
//  - ยกต่อเฉพาะงบที่ repeat ไม่เป็น false และไม่ได้ "หยุดใช้" (stopped)
//  - ปิดงบเดือนก่อน (enabled = false) ไม่กระทบ: เดือนใหม่กลับมาเปิดเอง ด้วยวงเงินล่าสุด
//  - หมวดที่มีเอกสารของเดือนนี้อยู่แล้ว (รวมที่ถูกหยุดใช้) ไม่สร้างซ้ำ
//  - ไม่สร้างให้เดือนอดีต/อนาคต (กันประวัติปลอมตอนไล่ดูเดือนเก่า)
// คืนรายการงบที่สร้างใหม่ (ให้ผู้เรียกคำนวณระดับแจ้งเตือนต่อ)
async function ensureCurrentMonth(userId, { now = Date.now() } = {}) {
  const cur = thaiPeriod(now);
  const curIdx = periodIndex(cur.year, cur.month);
  const all = await Budget.find({ user: userId, year: { $gte: cur.year - 1 } }).lean();

  const existing = new Set(all.filter((b) => b.year === cur.year && b.month === cur.month).map((b) => String(b.category)));
  const latest = new Map(); // category -> งบล่าสุดก่อนเดือนนี้ (ภายใน 12 เดือน)
  for (const b of all) {
    const idx = periodIndex(b.year, b.month);
    if (idx >= curIdx || idx < curIdx - MAX_LOOKBACK_MONTHS) continue;
    const key = String(b.category);
    if (existing.has(key)) continue;
    const prev = latest.get(key);
    if (!prev || idx > periodIndex(prev.year, prev.month)) latest.set(key, b);
  }

  const created = [];
  for (const src of latest.values()) {
    if (src.repeat === false || src.stopped === true) continue;
    try {
      const doc = await Budget.create({
        user: userId,
        category: src.category,
        month: cur.month,
        year: cur.year,
        amountLimit: src.amountLimit,
        alertThreshold: src.alertThreshold,
        payStyle: src.payStyle || 'auto',
        enabled: true,
        repeat: true,
        stopped: false,
        alertLevel: 0,
        forecastNotified: false,
      });
      created.push(doc);
    } catch (e) {
      if (e && e.code === 11000) continue; // อีกคำขอหนึ่งสร้างไปพร้อมกันแล้ว
      throw e;
    }
  }
  return created;
}

module.exports = { ensureCurrentMonth, thaiPeriod, periodIndex, MAX_LOOKBACK_MONTHS };
