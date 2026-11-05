const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const PlanAdvice = require('../models/PlanAdvice');
const AiEvent = require('../models/AiEvent');
const { aiConfig, AiError, intEnv } = require('../services/ai/aiClient');
const { checkAndBump, planDailyLimit, usedToday, globalAllow } = require('../services/ai/quota');
const { analyze } = require('../services/plan/analysis');
const { evaluateGoal } = require('../services/plan/goals');
const { buildFacts } = require('../services/plan/facts');
const { rulesAdvice } = require('../services/plan/rulesAdvice');
const { dataSignature, goalsSignature, isStale } = require('../services/plan/signature');
const { generateAdvice } = require('../services/plan/aiAdvice');
const { PLAN_CONSENT_VERSION, MAX_GOALS, MAX_GOAL_NAME, MAX_GOAL_YEARS } = require('../services/plan/constants');
const { bangkokToday, monthKeyOf, parseMonthKey, addMonths, addYearsIso, validIso } = require('../services/plan/dateUtil');
const { parseAmount, MAX_AMOUNT } = require('../utils/inputRules');

const router = express.Router();
router.use(auth);

const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
const round0 = (n) => Math.round(Number(n));
const MAX_TXNS = 20000;

const perMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: () => intEnv(process.env.AI_PLAN_USER_PER_MIN, 2),
  keyGenerator: (req) => `plan:${req.userId}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'ขอคำแนะนำถี่เกินไป กรุณารอสักครู่ (ยังดูคำแนะนำจากระบบด้านล่างได้)', 'AI_RATE'),
});

// ---------- โหลดข้อมูลและคำนวณ (ไม่ใช้ AI) ----------
function goalOut(g, analysis, todayIso) {
  const target_date = new Date(g.target_date).toISOString().slice(0, 10);
  const ev = evaluateGoal({ target_amount: g.target_amount, saved_amount: g.saved_amount, target_date }, { surplus: analysis.baseline.avg_surplus, todayIso });
  return { goal_id: String(g._id), name: g.name, target_amount: g.target_amount, saved_amount: g.saved_amount, target_date, ...ev };
}

async function loadPlan(userId, monthParam) {
  const todayIso = bangkokToday();
  const pm = parseMonthKey(monthParam) || parseMonthKey(todayIso.slice(0, 7));
  const base = addMonths(pm.year, pm.month, -3);
  const from = new Date(Date.UTC(base.year, base.month - 1, 1));
  const to = new Date(Date.UTC(pm.year, pm.month, 1));
  const [txns, cats, goals] = await Promise.all([
    Transaction.find({ user: userId, date: { $gte: from, $lt: to } }).select('date type amount category').limit(MAX_TXNS).lean(),
    Category.find({ $or: [{ user: null }, { user: userId }] }).lean(),
    Goal.find({ user: userId }).sort({ createdAt: 1 }).lean(),
  ]);
  const analysis = analyze({ txns, categories: cats, todayIso, month: monthKeyOf(pm.year, pm.month) });
  // เป้าหมายการออมเป็นเรื่องระยะยาว ไม่ผูกกับเดือนที่ดู: ประเมิน ณ ปัจจุบันเสมอ (ดูเดือนที่ผ่านมาก็เห็นสถานะปัจจุบันของเป้าหมาย)
  // ส่วนข้อเท็จจริง/คำแนะนำของเดือนที่ผ่านมาไม่พูดถึงเป้าหมาย (ตัวเลขฐานเป็นของเดือนนั้น)
  let goalEvals;
  if (analysis.is_current) goalEvals = goals.map((g) => goalOut(g, analysis, todayIso));
  else if (goals.length === 0) goalEvals = [];
  else goalEvals = (await loadPlan(userId)).goalEvals;
  const facts = buildFacts(analysis, analysis.is_current ? goalEvals : []);
  return { todayIso, analysis, goalEvals, facts, currentMonth: todayIso.slice(0, 7) };
}

const savedOut = (doc, stale = false) => (doc ? { items: doc.items.map((i) => ({ tag: i.tag, text: i.text, facts_used: i.facts_used, rating: i.rating || 0, source: 'ai' })), generated_at: doc.generated_at, model: doc.model, stale } : null);

async function aiState(userId) {
  const u = await User.findById(userId).select('aiPlanEnabled aiPlanConsentVersion').lean();
  return {
    configured: aiConfig().configured,
    plan_enabled: !!(u && u.aiPlanEnabled && u.aiPlanConsentVersion === PLAN_CONSENT_VERSION),
    plan_consent_version: PLAN_CONSENT_VERSION,
    plans_used_today: await usedToday(userId, new Date(), 'plans'),
    plan_daily_limit: planDailyLimit(),
  };
}

// ภาพรวมทั้งหมดของหน้า "วางแผน"
router.get('/overview', async (req, res) => {
  try {
    const { analysis, goalEvals, facts, currentMonth } = await loadPlan(req.userId, req.query.month);
    const saved = await PlanAdvice.findOne({ user: req.userId, month: analysis.month }).lean();
    res.json({ success: true, data: { month: analysis.month, current_month: currentMonth, is_current: analysis.is_current, analysis, goals: goalEvals, max_goals: MAX_GOALS, rules_advice: rulesAdvice(facts, goalEvals, { current: analysis.is_current }), ai_advice: savedOut(saved, isStale(saved, analysis, goalEvals)), ai: await aiState(req.userId) } });
  } catch (e) {
    console.error('[plan/overview]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// สรุปย่อสำหรับการ์ดบนแดชบอร์ด (เฉพาะเดือนปัจจุบัน ไม่เรียก AI)
router.get('/summary', async (req, res) => {
  try {
    const { analysis, goalEvals, facts } = await loadPlan(req.userId);
    const saved = await PlanAdvice.findOne({ user: req.userId, month: analysis.month }).lean();
    const g = goalEvals[0] || null;
    res.json({
      success: true,
      data: {
        month: analysis.month,
        has_data: analysis.data.has_data,
        projection: analysis.projection,
        income_month: analysis.totals.income,
        expense_month: analysis.totals.expense,
        limits: analysis.limits,
        rules_advice: rulesAdvice(facts, goalEvals).slice(0, 2),
        ai_advice_first: saved && saved.items[0] ? { tag: saved.items[0].tag, text: saved.items[0].text, facts_used: saved.items[0].facts_used } : null,
        goal: g ? { goal_id: g.goal_id, name: g.name, target_amount: g.target_amount, saved_amount: g.saved_amount, progress_pct: g.progress_pct, status: g.status, required_monthly: g.required_monthly, capacity_monthly: g.capacity_monthly, target_date: g.target_date } : null,
        goal_count: goalEvals.length,
      },
    });
  } catch (e) {
    console.error('[plan/summary]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ---------- ให้ AI เขียนคำแนะนำจากตัวเลขสรุป (ผู้ใช้กดเอง + ต้องยินยอมก่อน) ----------
router.post('/advice', perMinute, async (req, res) => {
  const started = Date.now();
  try {
    const cfg = aiConfig();
    if (!cfg.configured) return fail(res, 503, 'ระบบ AI ยังไม่พร้อมใช้งาน', 'AI_UNAVAILABLE');
    const user = await User.findById(req.userId).select('aiPlanEnabled aiPlanConsentVersion').lean();
    if (!user || !user.aiPlanEnabled || user.aiPlanConsentVersion !== PLAN_CONSENT_VERSION) {
      return fail(res, 403, 'ต้องยินยอมให้ส่งตัวเลขสรุปการเงินไปให้ AI ภายนอกวิเคราะห์ก่อน', 'AI_PLAN_CONSENT_REQUIRED');
    }
    const { analysis, goalEvals, facts } = await loadPlan(req.userId);
    if (!analysis.data.has_data) return fail(res, 422, 'ยังไม่มีข้อมูลเพียงพอให้วิเคราะห์ ลองบันทึกรายการก่อน', 'PLAN_NO_DATA');
    const quota = await checkAndBump(req.userId, new Date(), { field: 'plans', limit: planDailyLimit() });
    if (!quota.ok) return fail(res, 429, `ขอคำแนะนำจาก AI ครบ ${quota.limit} ครั้งของวันนี้แล้ว (ยังดูคำแนะนำจากระบบได้)`, 'AI_QUOTA');
    if (!globalAllow()) return fail(res, 503, 'ระบบ AI ถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY');

    let result;
    try {
      result = await generateAdvice(facts, { timeoutMs: intEnv(process.env.AI_PLAN_TIMEOUT_MS, 30000) });
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'UNAVAILABLE';
      if (code === 'AUTH') console.error('[ai] บริการ AI ปฏิเสธคีย์ ตรวจ AI_API_KEY');
      await AiEvent.create({ user: req.userId, kind: 'plan-advice', inputSource: 'plan', model: cfg.model, ok: false, errorCode: code, latencyMs: Date.now() - started }).catch(() => {});
      const map = {
        BUSY: [503, 'ระบบ AI ถูกใช้งานหนาแน่น ลองใหม่อีกสักครู่', 'AI_BUSY'],
        BAD_OUTPUT: [503, 'AI ตอบคำแนะนำที่ผ่านการตรวจไม่ได้ ลองใหม่อีกครั้ง (ยังดูคำแนะนำจากระบบได้)', 'AI_BAD_OUTPUT'],
      };
      const [status, message, c] = map[code] || [503, 'ระบบ AI ยังไม่พร้อมใช้งาน (ยังดูคำแนะนำจากระบบได้)', 'AI_UNAVAILABLE'];
      return fail(res, status, message, c);
    }

    const event = await AiEvent.create({
      user: req.userId, kind: 'plan-advice', inputSource: 'plan', model: result.model, ok: true, latencyMs: Date.now() - started,
      itemsReturned: result.items.length, numbersChecked: result.checked, numbersOk: result.ok, itemsDropped: result.dropped,
    });
    const items = result.items.map((i) => ({ tag: i.tag, text: i.text, facts_used: i.facts_used, rating: 0 }));
    const generated_at = new Date();
    await PlanAdvice.updateOne({ user: req.userId, month: analysis.month }, { $set: { items, model: result.model, event: event._id, generated_at, data_sig: dataSignature(analysis), goals_sig: goalsSignature(goalEvals) } }, { upsert: true });
    res.json({ success: true, data: { items: items.map((i) => ({ ...i, source: 'ai' })), generated_at, model: result.model, event_id: String(event._id), dropped: result.dropped, stale: false } });
  } catch (e) {
    console.error('[plan/advice]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ชอบ/ไม่ชอบรายข้อ (rating 1 / -1 / 0 = ยกเลิก) เก็บเป็นสถิติแบบไม่มีเนื้อหาไว้ประเมินคุณภาพ
router.put('/advice/feedback', async (req, res) => {
  try {
    const { month, index, rating } = req.body || {};
    if (!parseMonthKey(month) || !Number.isInteger(index) || ![1, -1, 0].includes(rating)) return fail(res, 400, 'ข้อมูลไม่ถูกต้อง');
    const doc = await PlanAdvice.findOne({ user: req.userId, month }).lean();
    if (!doc || index < 0 || index >= doc.items.length) return fail(res, 404, 'ไม่พบคำแนะนำข้อนี้');
    const items = doc.items.map((it, i) => (i === index ? { ...it, rating } : it));
    await PlanAdvice.updateOne({ _id: doc._id }, { $set: { items } });
    if (doc.event) {
      await AiEvent.updateOne({ _id: doc.event, user: req.userId }, { $set: { ratedUp: items.filter((i) => i.rating === 1).length, ratedDown: items.filter((i) => i.rating === -1).length } });
    }
    res.json({ success: true, data: { index, rating } });
  } catch (e) {
    console.error('[plan/feedback]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ลบคำแนะนำจาก AI ที่เก็บไว้ของเดือนนั้น
router.delete('/advice', async (req, res) => {
  try {
    const month = req.query.month;
    if (!parseMonthKey(month)) return fail(res, 400, 'เดือนไม่ถูกต้อง');
    await PlanAdvice.deleteOne({ user: req.userId, month });
    res.json({ success: true, message: 'ลบคำแนะนำที่เก็บไว้แล้ว' });
  } catch (e) {
    console.error('[plan/advice/delete]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ---------- เป้าหมายการออม ----------
function cleanGoalName(raw) {
  if (typeof raw !== 'string') return { error: 'ชื่อเป้าหมายไม่ถูกต้อง' };
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { error: 'กรุณากรอกชื่อเป้าหมาย' };
  if (Array.from(s).length > MAX_GOAL_NAME) return { error: `ชื่อเป้าหมายต้องไม่เกิน ${MAX_GOAL_NAME} ตัวอักษร` };
  if (/[\u0000-\u001f\u007f<>]/.test(s)) return { error: 'ชื่อเป้าหมายมีอักขระที่ไม่อนุญาต' };
  return { value: s };
}
function parseSaved(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: 0 };
  if (typeof raw === 'string' && !/^\s*\d+(\.\d+)?\s*$/.test(raw)) return { error: 'ยอดที่ออมแล้วไม่ถูกต้อง' };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: 'ยอดที่ออมแล้วไม่ถูกต้อง' };
  if (n > MAX_AMOUNT) return { error: `ยอดที่ออมแล้วต้องไม่เกิน ${MAX_AMOUNT.toLocaleString('en-US')} บาท` };
  return { value: Math.round(n * 100) / 100 };
}
function parseTargetDate(raw, todayIso) {
  if (!validIso(raw)) return { error: 'วันที่เป้าหมายไม่ถูกต้อง' };
  if (raw <= todayIso) return { error: 'วันที่เป้าหมายต้องเป็นวันในอนาคต' };
  if (raw > addYearsIso(todayIso, MAX_GOAL_YEARS)) return { error: `วันที่เป้าหมายต้องไม่เกิน ${MAX_GOAL_YEARS} ปีนับจากวันนี้` };
  return { value: raw };
}
const toDate = (iso) => new Date(`${iso}T00:00:00.000Z`);

router.get('/goals', async (req, res) => {
  try {
    const { goalEvals } = await loadPlan(req.userId);
    res.json({ success: true, data: { goals: goalEvals, max_goals: MAX_GOALS } });
  } catch (e) {
    console.error('[plan/goals]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.post('/goals', async (req, res) => {
  try {
    const b = req.body || {};
    const todayIso = bangkokToday();
    const name = cleanGoalName(b.name);
    if (name.error) return fail(res, 400, name.error);
    const target = parseAmount(b.target_amount, 'ยอดเป้าหมาย');
    if (target.error) return fail(res, 400, target.error);
    const saved = parseSaved(b.saved_amount);
    if (saved.error) return fail(res, 400, saved.error);
    const date = parseTargetDate(b.target_date, todayIso);
    if (date.error) return fail(res, 400, date.error);
    if ((await Goal.countDocuments({ user: req.userId })) >= MAX_GOALS) return fail(res, 400, `ตั้งเป้าหมายได้สูงสุด ${MAX_GOALS} เป้าหมาย ลบเป้าหมายเดิมก่อนถ้าต้องการเพิ่ม`);
    const created = await Goal.create({ user: req.userId, name: name.value, target_amount: target.value, saved_amount: saved.value, target_date: toDate(date.value) });
    const { analysis } = await loadPlan(req.userId);
    res.status(201).json({ success: true, message: 'เพิ่มเป้าหมายแล้ว', data: { goal: goalOut(created.toObject ? created.toObject() : created, analysis, todayIso) } });
  } catch (e) {
    console.error('[plan/goals/create]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.put('/goals/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ไม่พบเป้าหมาย');
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId }).lean();
    if (!goal) return fail(res, 404, 'ไม่พบเป้าหมาย');
    const b = req.body || {};
    const todayIso = bangkokToday();
    const set = {};
    if (b.name !== undefined) { const r = cleanGoalName(b.name); if (r.error) return fail(res, 400, r.error); set.name = r.value; }
    if (b.target_amount !== undefined) { const r = parseAmount(b.target_amount, 'ยอดเป้าหมาย'); if (r.error) return fail(res, 400, r.error); set.target_amount = r.value; }
    if (b.saved_amount !== undefined) { const r = parseSaved(b.saved_amount); if (r.error) return fail(res, 400, r.error); set.saved_amount = r.value; }
    if (b.target_date !== undefined) { const r = parseTargetDate(b.target_date, todayIso); if (r.error) return fail(res, 400, r.error); set.target_date = toDate(r.value); }
    if (Object.keys(set).length === 0) return fail(res, 400, 'ไม่มีข้อมูลที่จะแก้ไข');
    await Goal.updateOne({ _id: goal._id }, { $set: set });
    const { goalEvals } = await loadPlan(req.userId);
    res.json({ success: true, message: 'บันทึกการแก้ไขแล้ว', data: { goal: goalEvals.find((g) => g.goal_id === String(goal._id)) } });
  } catch (e) {
    console.error('[plan/goals/update]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.delete('/goals/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ไม่พบเป้าหมาย');
    const r = await Goal.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) return fail(res, 404, 'ไม่พบเป้าหมาย');
    res.json({ success: true, message: 'ลบเป้าหมายแล้ว' });
  } catch (e) {
    console.error('[plan/goals/delete]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ---------- ลองปรับแผน (คำนวณล้วน ไม่ใช้ AI) ----------
// adjustments: [{ category_id, pct }] pct = เปลี่ยนรายจ่ายหมวดนั้นกี่ % (ลบ = ลดรายจ่าย) เทียบค่าเฉลี่ยต่อเดือนของเดือนอ้างอิง
router.post('/simulate', async (req, res) => {
  try {
    const adj = req.body && req.body.adjustments;
    if (!Array.isArray(adj) || adj.length > 30) return fail(res, 400, 'ข้อมูลการปรับแผนไม่ถูกต้อง');
    const { todayIso, analysis, goalEvals } = await loadPlan(req.userId);
    const baseSurplus = analysis.baseline.avg_surplus;
    if (baseSurplus === null) return fail(res, 422, 'ยังไม่มีประวัติเดือนก่อนหน้าให้ใช้จำลองแผน', 'PLAN_NO_DATA');
    const baseCats = new Map(analysis.base_categories.map((c) => [c.category_id, c]));
    let delta = 0;
    const applied = [];
    for (const a of adj) {
      const pct = a && typeof a.pct === 'number' ? a.pct : NaN;
      const cat = a ? baseCats.get(String(a.category_id)) : null;
      if (!Number.isFinite(pct) || pct < -100 || pct > 100 || !cat) return fail(res, 400, 'ข้อมูลการปรับแผนไม่ถูกต้อง');
      const change = (cat.base_avg * -pct) / 100; // + = ออมเพิ่ม
      delta += change;
      applied.push({ category_id: cat.category_id, name: cat.name, pct, base_avg: cat.base_avg, monthly_change: round0(change) });
    }
    const goals = (surplus) => goalEvals.map((g) => ({ goal_id: g.goal_id, name: g.name, ...evaluateGoal({ target_amount: g.target_amount, saved_amount: g.saved_amount, target_date: g.target_date }, { surplus, todayIso }) }));
    res.json({ success: true, data: { base: { surplus: baseSurplus, goals: goals(baseSurplus) }, scenario: { surplus: round0(baseSurplus + delta), delta_monthly: round0(delta), goals: goals(baseSurplus + delta) }, applied } });
  } catch (e) {
    console.error('[plan/simulate]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

module.exports = router;
