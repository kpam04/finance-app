const AiUsage = require('../../models/AiUsage');
const { intEnv } = require('./aiClient');

// วันตามเวลาไทย (YYYY-MM-DD)
const dayKey = (now = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const dailyLimit = () => intEnv(process.env.AI_DAILY_LIMIT, 100);
const receiptDailyLimit = () => intEnv(process.env.AI_RECEIPT_DAILY_LIMIT, 15);

async function usedToday(userId, now = new Date(), field = 'calls') {
  const row = await AiUsage.findOne({ user: userId, day: dayKey(now) }).lean();
  return row ? row[field] || 0 : 0;
}

// นับและตรวจโควต้าต่อวันของผู้ใช้ (นับเฉพาะครั้งที่จะเรียกบริการ AI จริง)
async function checkAndBump(userId, now = new Date(), { field = 'calls', limit = dailyLimit() } = {}) {
  const day = dayKey(now);
  const used = await usedToday(userId, now, field);
  if (used >= limit) return { ok: false, used, limit };
  try {
    await AiUsage.updateOne({ user: userId, day }, { $inc: { [field]: 1 } }, { upsert: true });
  } catch (e) {
    if (e && e.code === 11000) await AiUsage.updateOne({ user: userId, day }, { $inc: { [field]: 1 } }); // สองคำขอสร้างแถวพร้อมกัน
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
const resetGlobal = () => { stamps.length = 0; ocrStamps.length = 0; geminiStamps.length = 0; };

// Typhoon OCR จำกัดทั้งคีย์ 20 คำขอ/นาที ตั้งเพดานของเราต่ำกว่านิดหน่อย
const ocrStamps = [];
function ocrGlobalAllow(now = Date.now()) {
  const max = intEnv(process.env.AI_OCR_GLOBAL_PER_MIN, 15);
  while (ocrStamps.length && now - ocrStamps[0] > 60000) ocrStamps.shift();
  if (ocrStamps.length >= max) return false;
  ocrStamps.push(now);
  return true;
}

// Gemini แผนฟรีมีโควต้าต่อนาทีต่ำ (ตัวเลขดูใน AI Studio ของโปรเจกต์คุณ) ตั้งเพดานของเราไว้ต่ำเผื่อไว้
const geminiStamps = [];
function geminiGlobalAllow(now = Date.now()) {
  const max = intEnv(process.env.AI_GEMINI_GLOBAL_PER_MIN, 8);
  while (geminiStamps.length && now - geminiStamps[0] > 60000) geminiStamps.shift();
  if (geminiStamps.length >= max) return false;
  geminiStamps.push(now);
  return true;
}

module.exports = { dayKey, dailyLimit, receiptDailyLimit, usedToday, checkAndBump, globalAllow, ocrGlobalAllow, geminiGlobalAllow, resetGlobal };
