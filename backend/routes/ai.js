const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Category = require('../models/Category');
const AiEvent = require('../models/AiEvent');
const { aiConfig, AiError, intEnv } = require('../services/ai/aiClient');
const { parseTextWithAi } = require('../services/ai/parseText');
const { checkAndBump, dailyLimit, usedToday, globalAllow } = require('../services/ai/quota');

const router = express.Router();
router.use(auth);

// เวอร์ชันของข้อความขอความยินยอมใช้ AI (เปลี่ยนเมื่อแก้ความหมายของข้อความ)
const AI_CONSENT_VERSION = '1.0';
const MAX_TEXT = 300;

const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });

// จำกัดต่อผู้ใช้ต่อนาที (กันกดรัว ๆ ใช้โควต้าฟรีหมด) ใช้รหัสผู้ใช้เป็นคีย์ ไม่ใช้ IP
const perMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: () => intEnv(process.env.AI_USER_PER_MIN, 8),
  keyGenerator: (req) => String(req.userId),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'ใช้ AI ถี่เกินไป กรุณารอสักครู่ (ระบบจะใช้การแยกแบบกฎแทน)', 'AI_RATE'),
});

async function statusFor(userId) {
  const cfg = aiConfig();
  const u = await User.findById(userId).select('aiEnabled aiConsentAt aiConsentVersion').lean();
  return {
    configured: cfg.configured, // ฝั่งเซิร์ฟเวอร์มีคีย์ AI หรือไม่ (ไม่เปิดเผยคีย์หรือที่อยู่)
    enabled: !!(u && u.aiEnabled),
    consent_version: AI_CONSENT_VERSION,
    consent_at: (u && u.aiConsentAt) || null,
    provider: cfg.provider,
    model: cfg.model,
    daily_limit: dailyLimit(),
    used_today: await usedToday(userId),
  };
}

router.get('/status', async (req, res) => {
  try {
    res.json({ success: true, data: await statusFor(req.userId) });
  } catch (e) {
    console.error('[ai/status]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// เปิด/ปิดการใช้ AI ภายนอก (ผู้ใช้เลือกเอง) เปิดได้เมื่อยอมรับข้อความเวอร์ชันปัจจุบัน
router.put('/consent', async (req, res) => {
  try {
    const { enabled, accept_version: acceptVersion } = req.body || {};
    if (typeof enabled !== 'boolean') return fail(res, 400, 'ข้อมูลไม่ถูกต้อง');
    if (enabled && acceptVersion !== AI_CONSENT_VERSION) return fail(res, 400, 'กรุณาอ่านและยอมรับข้อความการใช้ AI ก่อนเปิดใช้', 'AI_CONSENT_VERSION');
    const set = enabled
      ? { aiEnabled: true, aiConsentAt: new Date(), aiConsentVersion: AI_CONSENT_VERSION }
      : { aiEnabled: false };
    await User.updateOne({ _id: req.userId }, { $set: set });
    res.json({ success: true, message: enabled ? 'เปิดใช้ AI แล้ว' : 'ปิดการใช้ AI แล้ว', data: await statusFor(req.userId) });
  } catch (e) {
    console.error('[ai/consent]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// แยกข้อความ (พิมพ์/พูด) เป็นรายการด้วย AI แล้วให้ผู้ใช้ตรวจ/ยืนยันที่หน้าเว็บเสมอ (ที่นี่ไม่บันทึกรายการ)
router.post('/parse-text', perMinute, async (req, res) => {
  const started = Date.now();
  try {
    const cfg = aiConfig();
    const raw = req.body && typeof req.body.text === 'string' ? req.body.text : '';
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return fail(res, 400, 'กรุณาพิมพ์ข้อความ');
    if (Array.from(text).length > MAX_TEXT) return fail(res, 400, `ข้อความต้องไม่เกิน ${MAX_TEXT} ตัวอักษร`);

    if (!cfg.configured) return fail(res, 503, 'ระบบ AI ยังไม่พร้อมใช้งาน', 'AI_UNAVAILABLE');
    const user = await User.findById(req.userId).select('aiEnabled').lean();
    if (!user || !user.aiEnabled) return fail(res, 403, 'ต้องเปิดใช้ AI ก่อน (ข้อความจะถูกส่งไปบริการ AI ภายนอก)', 'AI_CONSENT_REQUIRED');

    const quota = await checkAndBump(req.userId);
    if (!quota.ok) return fail(res, 429, `ใช้ AI ครบ ${quota.limit} ครั้งของวันนี้แล้ว (ระบบจะใช้การแยกแบบกฎแทน)`, 'AI_QUOTA');
    if (!globalAllow()) return fail(res, 503, 'ระบบ AI ถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY');

    const cats = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
    const categories = cats.filter((c) => !c.hidden).map((c) => ({ id: c._id, name: c.name, type: c.type }));
    const inputSource = req.body.source === 'voice' ? 'voice' : 'typed';

    let result;
    try {
      result = await parseTextWithAi(text, { categories });
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'UNAVAILABLE';
      if (code === 'AUTH') console.error('[ai] บริการ AI ปฏิเสธคีย์ ตรวจ AI_API_KEY');
      await AiEvent.create({ user: req.userId, inputSource, model: cfg.model, ok: false, errorCode: code, latencyMs: Date.now() - started }).catch(() => {});
      const map = {
        BUSY: [503, 'ระบบ AI ถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY'],
        BAD_OUTPUT: [503, 'AI ตอบกลับในรูปแบบที่ใช้ไม่ได้', 'AI_BAD_OUTPUT'],
      };
      const [status, message, c] = map[code] || [503, 'ระบบ AI ยังไม่พร้อมใช้งาน', 'AI_UNAVAILABLE'];
      return fail(res, status, message, c);
    }

    const event = await AiEvent.create({
      user: req.userId, inputSource, model: result.model, ok: true, latencyMs: result.latencyMs,
      redactions: result.redactions, itemsReturned: result.items.length,
    });
    res.json({
      success: true,
      data: { items: result.items, event_id: String(event._id), model: result.model, redactions: result.redactions },
    });
  } catch (e) {
    console.error('[ai/parse-text]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// หน้าเว็บรายงานว่าผู้ใช้ทำอะไรกับผลของ AI (ไม่ส่งเนื้อหา/ยอดเงินมา) ใช้วัดผลในรายงาน
//  confirmed / skipped / cancelled        : ผู้ใช้ตัดสินใจกับรายการที่มาจาก AI (confirmed แนบ edited = ฟิลด์ที่แก้)
//  compared (แนบ diff, client_ms)         : ผู้ใช้กดให้ AI ตรวจ และ AI เห็นต่างจากฟอร์มที่ฟิลด์ไหน / ใช้เวลารอกี่ มิลลิวินาที
//  adopted / kept                         : ผู้ใช้เลือกใช้ผลของ AI / เก็บค่าของกฎไว้
//  rules_confirmed (แนบ edited)           : ผู้ใช้เก็บค่าของกฎไว้แล้วกดยืนยัน แก้ฟิลด์ไหนจากที่กฎอ่านได้
const FIELD_KEYS = ['amount', 'category', 'date', 'type', 'note'];
const cap = (k) => k.charAt(0).toUpperCase() + k.slice(1);
const flagsToInc = (obj, prefix) => {
  const inc = {};
  if (obj && typeof obj === 'object') for (const k of FIELD_KEYS) if (obj[k] === true) inc[`${prefix}${cap(k)}`] = 1;
  return inc;
};
const ACTIONS = ['confirmed', 'skipped', 'cancelled', 'compared', 'adopted', 'kept', 'rules_confirmed'];

router.put('/events/:id/feedback', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ไม่พบข้อมูล');
    const { action, edited, diff, client_ms: clientMs } = req.body || {};
    if (!ACTIONS.includes(action)) return fail(res, 400, 'ข้อมูลไม่ถูกต้อง');
    const ev = await AiEvent.findOne({ _id: req.params.id, user: req.userId }).lean();
    if (!ev) return fail(res, 404, 'ไม่พบข้อมูล');

    let inc = {};
    if (action === 'confirmed') inc = { confirmed: 1, ...flagsToInc(edited, 'edited') };
    else if (action === 'skipped' || action === 'cancelled' || action === 'adopted' || action === 'kept') inc = { [action]: 1 };
    else if (action === 'rules_confirmed') inc = { rulesConfirmed: 1, ...flagsToInc(edited, 'rulesEdited') };
    else if (action === 'compared') {
      inc = { compared: 1, ...flagsToInc(diff, 'diff') };
      const ms = Number(clientMs);
      if (Number.isFinite(ms) && ms >= 0 && ms <= 600000) inc.clientMsTotal = Math.round(ms);
    }
    await AiEvent.updateOne({ _id: ev._id }, { $inc: inc });
    res.json({ success: true });
  } catch (e) {
    console.error('[ai/feedback]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

module.exports = router;
module.exports.AI_CONSENT_VERSION = AI_CONSENT_VERSION;
