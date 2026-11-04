const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Category = require('../models/Category');
const AiEvent = require('../models/AiEvent');
const { aiConfig, AiError, intEnv } = require('../services/ai/aiClient');
const { parseTextWithAi } = require('../services/ai/parseText');
const { parseReceiptWithEngines } = require('../services/ai/parseReceipt');
const { geminiConfig } = require('../services/ai/geminiClient');
const { checkReceiptImage } = require('../services/ai/imageCheck');
const { checkAndBump, dailyLimit, receiptDailyLimit, usedToday, globalAllow, ocrGlobalAllow, geminiGlobalAllow } = require('../services/ai/quota');

const router = express.Router();
router.use(auth);

// เวอร์ชันของข้อความขอความยินยอมใช้ AI (เปลี่ยนเมื่อแก้ความหมายของข้อความ)
const AI_CONSENT_VERSION = '1.0';
// 1.1 = ระบุว่ารูปอาจถูกส่งให้ Google Gemini เป็นตัวอ่านสำรองด้วย (ผู้ที่ยินยอมเวอร์ชัน 1.0 ต้องยินยอมใหม่)
const AI_IMAGE_CONSENT_VERSION = '1.1'; // ข้อความขอความยินยอมให้ส่ง "รูปใบเสร็จ" ไปบริการ AI ภายนอก (แยกจากการส่งข้อความ)
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

const receiptPerMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: () => intEnv(process.env.AI_RECEIPT_USER_PER_MIN, 3),
  keyGenerator: (req) => `receipt:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'ส่งใบเสร็จถี่เกินไป กรุณารอสักครู่', 'AI_RATE'),
});

// ตัวอ่านใบเสร็จที่ใช้ได้ตามลำดับ (ตั้งลำดับด้วย AI_RECEIPT_ENGINES เช่น typhoon,gemini) เฉพาะตัวที่ตั้งคีย์ไว้
function receiptEngines() {
  const avail = { typhoon: aiConfig().configured, gemini: geminiConfig().configured };
  const order = String(process.env.AI_RECEIPT_ENGINES || 'typhoon,gemini').split(',').map((s) => s.trim()).filter((s) => s in avail);
  return order.filter((e, i) => avail[e] && order.indexOf(e) === i);
}

async function statusFor(userId) {
  const cfg = aiConfig();
  const u = await User.findById(userId).select('aiEnabled aiConsentAt aiConsentVersion aiImageEnabled aiImageConsentAt aiImageConsentVersion').lean();
  return {
    configured: cfg.configured, // ฝั่งเซิร์ฟเวอร์มีคีย์ AI หรือไม่ (ไม่เปิดเผยคีย์หรือที่อยู่)
    enabled: !!(u && u.aiEnabled),
    consent_version: AI_CONSENT_VERSION,
    consent_at: (u && u.aiConsentAt) || null,
    provider: cfg.provider,
    model: cfg.model,
    daily_limit: dailyLimit(),
    used_today: await usedToday(userId),
    // อ่านรูปใบเสร็จ (ส่งรูปไปบริการภายนอก) แยกความยินยอมและโควต้า
    image_enabled: !!(u && u.aiImageEnabled && u.aiImageConsentVersion === AI_IMAGE_CONSENT_VERSION),
    receipt_engines: receiptEngines(), // ชื่อตัวอ่านที่ใช้ได้ตามลำดับ (บอกผู้ใช้ในหน้าต่างยินยอมว่ารูปอาจไปที่ไหนบ้าง)
    image_consent_version: AI_IMAGE_CONSENT_VERSION,
    image_consent_at: (u && u.aiImageConsentAt) || null,
    ocr_model: cfg.ocrModel,
    receipt_daily_limit: receiptDailyLimit(),
    receipts_used_today: await usedToday(userId, new Date(), 'receipts'),
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
//  scope = 'text' (ค่าเริ่มต้น): ส่งข้อความที่พิมพ์/พูด / scope = 'image': ส่งรูปใบเสร็จ (ความยินยอมแยกกัน)
router.put('/consent', async (req, res) => {
  try {
    const { enabled, accept_version: acceptVersion } = req.body || {};
    const scope = req.body && req.body.scope === 'image' ? 'image' : 'text';
    if (typeof enabled !== 'boolean') return fail(res, 400, 'ข้อมูลไม่ถูกต้อง');
    const need = scope === 'image' ? AI_IMAGE_CONSENT_VERSION : AI_CONSENT_VERSION;
    if (enabled && acceptVersion !== need) return fail(res, 400, 'กรุณาอ่านและยอมรับข้อความการใช้ AI ก่อนเปิดใช้', 'AI_CONSENT_VERSION');
    let set;
    if (scope === 'image') set = enabled ? { aiImageEnabled: true, aiImageConsentAt: new Date(), aiImageConsentVersion: need } : { aiImageEnabled: false };
    else set = enabled ? { aiEnabled: true, aiConsentAt: new Date(), aiConsentVersion: need } : { aiEnabled: false };
    await User.updateOne({ _id: req.userId }, { $set: set });
    const label = scope === 'image' ? 'การอ่านรูปใบเสร็จด้วย AI' : 'การใช้ AI';
    res.json({ success: true, message: enabled ? `เปิด${label}แล้ว` : `ปิด${label}แล้ว`, data: await statusFor(req.userId) });
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

// อ่านรูปใบเสร็จ -> ได้ร่างรายการ "ยอดที่ชำระ" 1 รายการ + รายการสินค้า (แสดงให้ดูอย่างเดียว) ผู้ใช้ตรวจ/ยืนยันที่หน้าเว็บเสมอ
// ไม่เก็บรูปและข้อความ OCR (อยู่ในหน่วยความจำเฉพาะคำขอนี้) ไม่ส่งข้อความ OCR กลับ ไม่บันทึกเนื้อหาลงบันทึกการทำงาน
router.post('/parse-receipt', receiptPerMinute, async (req, res) => {
  const started = Date.now();
  try {
    const cfg = aiConfig();
    const img = checkReceiptImage(req.body && req.body.image);
    if (img.error) return fail(res, 400, img.error);

    const engines = receiptEngines();
    if (!engines.length) return fail(res, 503, 'ระบบ AI ยังไม่พร้อมใช้งาน', 'AI_UNAVAILABLE');
    const user = await User.findById(req.userId).select('aiImageEnabled aiImageConsentVersion').lean();
    if (!user || !user.aiImageEnabled || user.aiImageConsentVersion !== AI_IMAGE_CONSENT_VERSION) return fail(res, 403, 'ต้องยินยอมให้ส่งรูปใบเสร็จไปบริการ AI ภายนอกก่อน', 'AI_IMAGE_CONSENT_REQUIRED');

    const quota = await checkAndBump(req.userId, new Date(), { field: 'receipts', limit: receiptDailyLimit() });
    if (!quota.ok) return fail(res, 429, `อ่านใบเสร็จครบ ${quota.limit} ใบของวันนี้แล้ว (กรอกรายการเองหรือรอพรุ่งนี้)`, 'AI_QUOTA');
    // ตัวไหนเต็มเพดานต่อนาทีของตัวเอง ข้ามไปใช้ตัวที่เหลือ (ถ้าไม่เหลือเลย = หนาแน่น)
    const usable = engines.filter((e) => (e === 'gemini' ? geminiGlobalAllow() : ocrGlobalAllow()));
    if (!usable.length) return fail(res, 503, 'ระบบอ่านใบเสร็จถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY');
    // ถ้ายังมีตัวสำรองต่อท้าย ตัวหลักได้เวลาสั้นลง (ค่าเริ่มต้น 35 วินาที) เพื่อสลับไปตัวสำรองไวขึ้น
    const primaryMs = intEnv(process.env.AI_RECEIPT_PRIMARY_TIMEOUT_MS, 35000);
    const plan = usable.map((name, i) => ({ name, budgetMs: i < usable.length - 1 ? primaryMs : undefined }));

    const cats = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
    const categories = cats.filter((c) => !c.hidden).map((c) => ({ id: c._id, name: c.name, type: c.type }));

    let result;
    try {
      result = await parseReceiptWithEngines(img.value, { categories, engines: plan });
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'UNAVAILABLE';
      if (code === 'AUTH') console.error('[ai] บริการ AI ปฏิเสธคีย์ ตรวจ AI_API_KEY');
      await AiEvent.create({ user: req.userId, kind: 'parse-receipt', inputSource: 'image', model: cfg.ocrModel, ok: false, errorCode: code, latencyMs: Date.now() - started, attemptsLog: e.attempts || [], fallbackUsed: (e.attempts || []).length > 1 }).catch(() => {});
      const map = {
        BUSY: [503, 'ระบบ AI ถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY'],
        BAD_OUTPUT: [503, 'อ่านใบเสร็จไม่สำเร็จ (ผลที่ได้ใช้ไม่ได้) ลองถ่ายให้ชัดขึ้นหรือกรอกเอง', 'AI_BAD_OUTPUT'],
        NO_TOTAL: [422, 'อ่านยอดเงินจากรูปนี้ไม่ได้ ลองถ่ายให้เห็นยอดรวมชัดขึ้นหรือกรอกเอง', 'AI_NO_TOTAL'],
      };
      const [status, message, c] = map[code] || [503, 'ระบบ AI ยังไม่พร้อมใช้งาน', 'AI_UNAVAILABLE'];
      return fail(res, status, message, c);
    }

    const event = await AiEvent.create({
      user: req.userId, kind: 'parse-receipt', inputSource: 'image', model: result.model, ok: true, latencyMs: result.latencyMs, ocrMs: result.ocrMs,
      redactions: result.redactions, itemsReturned: 1, docType: result.receipt.document_type, totalMismatch: !!result.item.flags.total_mismatch,
      engine: result.engine, fallbackUsed: result.attempts.length > 1, attemptsLog: result.attempts,
    });
    res.json({
      success: true,
      data: {
        items: [result.item],
        receipt: result.receipt,
        event_id: String(event._id),
        model: result.model,
        ocr_model: result.ocrModel,
        engine: result.engine, // typhoon | gemini (ตัวที่ได้ผลจริง)
        attempts: result.attempts, // ความพยายามของแต่ละตัว: เวลา/ผล/รหัสข้อผิดพลาด (ไม่มีเนื้อหา)
        ocr_ms: result.ocrMs,
        server_ms: result.latencyMs,
        redactions: result.redactions,
      },
    });
  } catch (e) {
    console.error('[ai/parse-receipt]', e.message);
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
module.exports.AI_IMAGE_CONSENT_VERSION = AI_IMAGE_CONSENT_VERSION;
