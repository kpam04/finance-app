const AiUsage = require('../../models/AiUsage');
const { intEnv } = require('./aiClient');

// วันตามเวลาไทย (YYYY-MM-DD)
const dayKey = (now = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const dailyLimit = () => intEnv(process.env.AI_DAILY_LIMIT, 100);

async function usedToday(userId, now = new Date()) {
  const row = await AiUsage.findOne({ user: userId, day: dayKey(now) }).lean();
  return row ? row.calls || 0 : 0;
}

// นับและตรวจโควต้าต่อวันของผู้ใช้ (นับเฉพาะครั้งที่จะเรียกบริการ AI จริง)
async function checkAndBump(userId, now = new Date()) {
  const limit = dailyLimit();
  const day = dayKey(now);
  const used = await usedToday(userId, now);
  if (used >= limit) return { ok: false, used, limit };
  try {
    await AiUsage.updateOne({ user: userId, day }, { $inc: { calls: 1 } }, { upsert: true });
  } catch (e) {
    if (e && e.code === 11000) await AiUsage.updateOne({ user: userId, day }, { $inc: { calls: 1 } }); // สองคำขอสร้างแถวพร้อมกัน
    else throw e;
  }
  return { ok: true, used: used + 1, limit };
}

// จำกัดภาพรวมทั้งระบบต่อนาที (แผนฟรีของผู้ให้บริการมีเพดานรวมต่อคีย์) เก็บในหน่วยความจำของเซิร์ฟเวอร์
const stamps = [];
function globalAllow(now = Date.now()) {
  const max = intEnv(process.env.AI_GLOBAL_PER_MIN, 120);
  while (stamps.length && now - stamps[0] > 60000) stamps.shift();
  if (stamps.length >= max) return false;
  stamps.push(now);
  return true;
}
const resetGlobal = () => { stamps.length = 0; };

module.exports = { dayKey, dailyLimit, usedToday, checkAndBump, globalAllow, resetGlobal };
