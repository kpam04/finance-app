const express = require('express');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');
const Budget = require('../models/Budget');
const Installment = require('../models/Installment');
const Recurring = require('../models/Recurring');
const PlanAdvice = require('../models/PlanAdvice');
const AiEvent = require('../models/AiEvent');
const { aiConfig, AiError, intEnv } = require('../services/ai/aiClient');
const { checkAndBump, planDailyLimit, usedToday, globalAllow } = require('../services/ai/quota');
const { analyze } = require('../services/plan/analysis');
const { evaluateGoal } = require('../services/plan/goals');
const { buildFacts } = require('../services/plan/facts');
const { rulesAdvice } = require('../services/plan/rulesAdvice');
const { decorateAdvice } = require('../services/plan/adviceActions');
const { suggestionsFor, notifySuggestions } = require('../services/recurringSuggest');
const { todayTH } = require('../services/recurringRunner');
const { installmentFacts } = require('../services/plan/instFacts');
const { dataSignature, goalsSignature, isStale } = require('../services/plan/signature');
const { generateAdvice, polishText } = require('../services/plan/aiAdvice');
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

const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const bkkDay = (d) => new Date(new Date(d).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10); // วันที่ตามเวลาไทย
const isDone = (g) => !!g.completed_at;
const reachedTarget = (g) => Number(g.saved_amount) >= Number(g.target_amount);

// เป้าที่ออมสำเร็จแล้ว (ประวัติ): ใช้เวลากี่วัน และเร็ว/ช้ากว่ากำหนดกี่วัน (บวก = เร็วกว่ากำหนด)
function achievementOut(g) {
  const start = bkkDay(g.createdAt || g.completed_at);
  const done = bkkDay(g.completed_at);
  const target = isoDay(g.target_date);
  const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
  return {
    goal_id: String(g._id), name: g.name, target_amount: g.target_amount, saved_amount: g.saved_amount,
    target_date: target, started_at: start, completed_at: done,
    duration_days: Math.max(0, days(start, done)), early_days: days(done, target),
  };
}

// ย้ายเป้าที่ยอดออมถึงเป้าแล้ว (แต่ยังไม่ถูกปิด เช่น ข้อมูลก่อนมีระบบนี้) ไปเป็น "สำเร็จแล้ว" ใช้วันที่แก้ไขล่าสุดเป็นวันที่สำเร็จ
async function autoComplete(goals) {
  const pending = goals.filter((g) => !isDone(g) && reachedTarget(g));
  for (const g of pending) {
    g.completed_at = g.updatedAt || new Date();
    await Goal.updateOne({ _id: g._id, completed_at: null }, { $set: { completed_at: g.completed_at } });
  }
}

async function loadPlan(userId, monthParam) {
  const todayIso = bangkokToday();
  const pm = parseMonthKey(monthParam) || parseMonthKey(todayIso.slice(0, 7));
  const base = addMonths(pm.year, pm.month, -3);
  const from = new Date(Date.UTC(base.year, base.month - 1, 1));
  const to = new Date(Date.UTC(pm.year, pm.month, 1));
  const [txns, cats, goals] = await Promise.all([
    Transaction.find({ user: userId, date: { $gte: from, $lt: to } }).select('date type amount category note recurring installment').limit(MAX_TXNS).lean(),
    Category.find({ $or: [{ user: null }, { user: userId }] }).lean(),
    Goal.find({ user: userId }).sort({ createdAt: 1 }).lean(),
  ]);
  // ค่าประจำที่รู้แน่นอน: งวดผ่อน และรายการเกิดซ้ำรายเดือน/รายปี (รายวัน/รายสัปดาห์ เช่น ค่าข้าว ยังนับเป็นพฤติกรรมการใช้จ่าย)
  const recIds = [...new Set(txns.filter((t) => t.recurring).map((t) => String(t.recurring)))];
  const recs = recIds.length ? await Recurring.find({ _id: { $in: recIds }, user: userId }).select('frequency').lean() : [];
  const fixedRec = new Set(recs.filter((r) => r.frequency === 'monthly' || r.frequency === 'yearly').map((r) => String(r._id)));
  const marked = txns.map((t) => ({ date: t.date, type: t.type, amount: t.amount, category: t.category, note: t.note || '', fixed: !!t.installment || (t.recurring && fixedRec.has(String(t.recurring))), installment_paid: !!t.installment }));
  const analysis = analyze({ txns: marked, categories: cats, todayIso, month: monthKeyOf(pm.year, pm.month) });
  await autoComplete(goals);
  const active = goals.filter((g) => !isDone(g));
  const achievements = goals.filter(isDone).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).map(achievementOut);
  // เป้าหมายการออมเป็นเรื่องระยะยาว ไม่ผูกกับเดือนที่ดู: ประเมิน ณ ปัจจุบันเสมอ (ดูเดือนที่ผ่านมาก็เห็นสถานะปัจจุบันของเป้าหมาย)
  // ส่วนข้อเท็จจริง/คำแนะนำของเดือนที่ผ่านมาไม่พูดถึงเป้าหมาย (ตัวเลขฐานเป็นของเดือนนั้น)
  let goalEvals;
  if (analysis.is_current) goalEvals = active.map((g) => goalOut(g, analysis, todayIso));
  else if (active.length === 0) goalEvals = [];
  else goalEvals = (await loadPlan(userId)).goalEvals;
  // รายการผ่อน (ภาระต่อเดือน / รายการที่ใกล้ผ่อนจบ) เป็นเรื่องของตอนนี้ ใช้เฉพาะเดือนปัจจุบัน
  let inst = null;
  if (analysis.is_current) {
    const plans = await Installment.find({ user: userId, status: 'active' }).lean();
    inst = installmentFacts(plans, todayIso, analysis.projection.income_ref);
  }
  // ค่าใช้จ่ายประจำทั้งเดือน: เติมงวดผ่อน (เดือนปัจจุบัน = จ่ายแล้ว + ที่ครบกำหนดเดือนนี้แต่ยังไม่จ่าย / เดือนที่ผ่านมา = ที่จ่ายจริง)
  const fm = analysis.fixed_month;
  if (fm) {
    const paid = inst ? Number(inst.paid_month) || 0 : fm.inst_paid || 0;
    const pending = inst ? Number(inst.left_month) || 0 : 0;
    if (paid + pending > 0) {
      fm.by_category.push({ category_id: 'installments', name: 'งวดผ่อน', paid: Math.round(paid), pending: Math.round(pending), amount: Math.round(paid + pending), status: pending > 0 ? (paid > 0 ? 'partial' : 'pending') : 'paid', due_date: pending > 0 && inst ? inst.next_due : null });
      fm.by_category.sort((x, y) => y.amount - x.amount);
      fm.total += Math.round(paid + pending);
      fm.paid += Math.round(paid);
      fm.pending += Math.round(pending);
    }
    fm.pct_of_income = fm.income_ref ? Math.round((fm.total / fm.income_ref) * 1000) / 10 : null;
  }
  const facts = buildFacts(analysis, analysis.is_current ? goalEvals : [], inst);
  return { todayIso, analysis, goalEvals, achievements, facts, inst, currentMonth: todayIso.slice(0, 7) };
}

// ข้อมูลประกอบปุ่มลงมือทำของคำแนะนำ: หมวดที่มีงบในเดือนที่ดูแล้ว (มีแล้ว = ปุ่ม "ดูงบ" / ยังไม่มี = ปุ่ม "ตั้งงบ")
async function adviceCtx(userId, analysis, goalEvals) {
  const [y, m] = analysis.month.split('-').map(Number);
  const nx = addMonths(y, m, 1);
  const [budgets, nextBudgets] = await Promise.all([
    Budget.find({ user: userId, month: m, year: y, stopped: { $ne: true } }).select('category').lean(),
    analysis.is_current ? Budget.find({ user: userId, month: nx.month, year: nx.year, stopped: { $ne: true } }).select('category').lean() : [],
  ]);
  return {
    current: analysis.is_current, anomalies: analysis.anomalies, goalEvals,
    budgetCats: new Set(budgets.map((b) => String(b.category))),
    nextBudgetCats: new Set(nextBudgets.map((b) => String(b.category))),
    nextPeriod: analysis.is_current ? { month: nx.month, year: nx.year } : null,
  };
}

// คำแนะนำของ AI ที่เก็บไว้: ป้ายสั้นของตัวเลข (short/label) ใช้ของปัจจุบัน ถ้ามีข้อเท็จจริง id เดียวกัน (ป้ายเคยเปลี่ยนชื่อ เช่น "เฉลี่ย" → "เฉลี่ย/เดือน") ค่าตัวเลขยังเป็นของตอนที่ AI เขียน
const savedOut = (doc, stale = false, ctx = null, facts = []) => {
  if (!doc) return null;
  const cur = new Map(facts.map((f) => [f.id, f]));
  const relabel = (f) => (cur.has(f.id) && cur.get(f.id).unit === f.unit ? { ...f, label: cur.get(f.id).label, ...(cur.get(f.id).short !== undefined ? { short: cur.get(f.id).short } : {}) } : f);
  const items = doc.items.map((i) => ({ tag: i.tag, text: polishText(i.text, i.facts_used || []), facts_used: (i.facts_used || []).map(relabel), rating: i.rating || 0, source: 'ai' }));
  return { items: ctx ? decorateAdvice(items, ctx) : items, generated_at: doc.generated_at, model: doc.model, stale };
};

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
    const { analysis, goalEvals, achievements, facts, inst, currentMonth } = await loadPlan(req.userId, req.query.month);
    const [saved, ctx] = await Promise.all([PlanAdvice.findOne({ user: req.userId, month: analysis.month }).lean(), adviceCtx(req.userId, analysis, goalEvals)]);
    // รายจ่ายที่จดเองทุกเดือนแต่ยังไม่ได้ตั้งเป็นรายการเกิดซ้ำ (เฉพาะเดือนปัจจุบัน) → คำแนะนำ 1 ข้อ + แจ้งกระดิ่งครั้งเดียวต่อรายการ
    const recSug = analysis.is_current ? await suggestionsFor(req.userId, todayTH().toISOString().slice(0, 10)).catch(() => []) : [];
    if (recSug.length) notifySuggestions(req.userId, recSug).catch((e) => console.error('[plan/rec-suggest]', e.message));
    res.json({
      success: true,
      data: {
        month: analysis.month, current_month: currentMonth, is_current: analysis.is_current, analysis, goals: goalEvals, achievements, max_goals: MAX_GOALS,
        installments: inst, budget_category_ids: [...ctx.budgetCats],
        rules_advice: decorateAdvice([...rulesAdvice(facts, goalEvals, { current: analysis.is_current }), ...recSuggestAdvice(recSug)], ctx),
        ai_advice: savedOut(saved, isStale(saved, analysis, goalEvals), ctx, facts),
        ai: await aiState(req.userId),
      },
    });
  } catch (e) {
    console.error('[plan/overview]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// คำแนะนำ "ตั้งเป็นรายการเกิดซ้ำ" (ไม่ส่งให้ AI: ชื่อรายการเป็นข้อความที่ผู้ใช้จดเอง)
function recSuggestAdvice(list) {
  if (!list.length) return [];
  const s = list[0];
  const amt = `${(Math.round(s.amount * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`;
  const text = list.length === 1
    ? `“${s.note}” ${amt} ดูเหมือนเป็นรายจ่ายที่คุณจดเองทุกเดือน ตั้งเป็นรายการเกิดซ้ำไว้ ระบบจะบันทึกให้และกันเงินไว้ในงบให้อัตโนมัติ`
    : `พบรายจ่ายที่คุณจดเองทุกเดือน ${list.length} รายการ เช่น “${s.note}” ${amt} ตั้งเป็นรายการเกิดซ้ำไว้ ระบบจะบันทึกให้และกันเงินไว้ในงบให้อัตโนมัติ`;
  return [{ tag: 'tip', group: 'save', source: 'rules', text, facts_used: [{ id: 'rec_suggest', label: 'รายจ่ายประจำที่ยังไม่ได้ตั้งเป็นรายการเกิดซ้ำ', short: 'ยังไม่ได้ตั้ง', value: list.length, unit: 'รายการ', ai: false }] }];
}

// สรุปย่อสำหรับการ์ดบนแดชบอร์ด (เฉพาะเดือนปัจจุบัน ไม่เรียก AI)
router.get('/summary', async (req, res) => {
  try {
    const { analysis, goalEvals, achievements, facts } = await loadPlan(req.userId);
    const saved = await PlanAdvice.findOne({ user: req.userId, month: analysis.month }).lean();
    const g = goalEvals[0] || null;
    // ชวนตั้งรายการเกิดซ้ำ (แสดงเป็น 1 ข้อในการ์ด Insight ของแดชบอร์ด เฉพาะตอนมีรายการให้ชวน)
    const recSug = await suggestionsFor(req.userId, todayTH().toISOString().slice(0, 10)).catch(() => []);
    const rec = recSuggestAdvice(recSug)[0];
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
        rec_suggest: rec ? { tag: rec.tag, text: rec.text, count: recSug.length } : null,
        ai_advice_first: saved && saved.items[0] ? { tag: saved.items[0].tag, text: saved.items[0].text, facts_used: saved.items[0].facts_used } : null,
        goal: g ? { goal_id: g.goal_id, name: g.name, target_amount: g.target_amount, saved_amount: g.saved_amount, progress_pct: g.progress_pct, status: g.status, required_monthly: g.required_monthly, capacity_monthly: g.capacity_monthly, target_date: g.target_date } : null,
        goal_count: goalEvals.length,
        achieved_count: achievements.length,
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
    const ctx = await adviceCtx(req.userId, analysis, goalEvals);
    res.json({ success: true, data: { items: decorateAdvice(items.map((i) => ({ ...i, source: 'ai' })), ctx), generated_at, model: result.model, event_id: String(event._id), dropped: result.dropped, stale: false } });
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
    const { goalEvals, achievements } = await loadPlan(req.userId);
    res.json({ success: true, data: { goals: goalEvals, achievements, max_goals: MAX_GOALS } });
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
    if ((await Goal.countDocuments({ user: req.userId, completed_at: null })) >= MAX_GOALS) return fail(res, 400, `ตั้งเป้าหมายที่กำลังออมได้สูงสุด ${MAX_GOALS} เป้าหมาย`);
    const done = saved.value >= target.value; // ออมครบตั้งแต่ตอนสร้าง → เป็น "สำเร็จแล้ว" ทันที
    const created = await Goal.create({ user: req.userId, name: name.value, target_amount: target.value, saved_amount: saved.value, target_date: toDate(date.value), completed_at: done ? new Date() : null });
    const obj = created.toObject ? created.toObject() : created;
    if (done) return res.status(201).json({ success: true, message: 'เพิ่มเป้าหมายแล้ว', data: { goal: null, just_completed: true, achievement: achievementOut(obj) } });
    const { analysis } = await loadPlan(req.userId);
    res.status(201).json({ success: true, message: 'เพิ่มเป้าหมายแล้ว', data: { goal: goalOut(obj, analysis, todayIso) } });
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
    const reopen = b.reopen === true; // ย้ายเป้าที่สำเร็จแล้วกลับไปกำลังออม (กรณีกรอกยอดผิด)
    if (isDone(goal) && !reopen) return fail(res, 400, 'เป้าหมายนี้สำเร็จแล้ว ถ้าจะแก้ไข ให้ย้ายกลับไปกำลังออมก่อน');
    if (!isDone(goal) && Object.keys(set).length === 0) return fail(res, 400, 'ไม่มีข้อมูลที่จะแก้ไข');
    const next = { ...goal, ...set };
    if (reopen && isDone(goal)) {
      if (reachedTarget(next)) return fail(res, 400, 'ยอดที่ออมแล้วยังเท่ากับหรือมากกว่ายอดเป้าหมาย แก้ยอดที่ออมแล้วให้น้อยกว่าเป้าหมายก่อนย้ายกลับ');
      if ((await Goal.countDocuments({ user: req.userId, completed_at: null })) >= MAX_GOALS) return fail(res, 400, `มีเป้าหมายที่กำลังออมครบ ${MAX_GOALS} เป้าแล้ว ย้ายกลับไม่ได้`);
      set.completed_at = null;
    }
    // ยอดออมถึงเป้าแล้ว → ปิดเป้าเป็น "สำเร็จแล้ว" อัตโนมัติ
    const justCompleted = !isDone(goal) && reachedTarget(next);
    if (justCompleted) set.completed_at = new Date();
    await Goal.updateOne({ _id: goal._id }, { $set: set });
    if (justCompleted) {
      const fresh = await Goal.findById(goal._id).lean();
      return res.json({ success: true, message: 'ออมครบตามเป้าหมายแล้ว', data: { goal: null, just_completed: true, achievement: achievementOut(fresh) } });
    }
    const { goalEvals } = await loadPlan(req.userId);
    res.json({ success: true, message: reopen ? 'ย้ายกลับไปกำลังออมแล้ว' : 'บันทึกการแก้ไขแล้ว', data: { goal: goalEvals.find((g) => g.goal_id === String(goal._id)) || null } });
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
      const change = ((cat.base_avg - (cat.fixed_avg || 0)) * -pct) / 100; // + = ออมเพิ่ม (ปรับได้เฉพาะส่วนที่ไม่ใช่ค่าประจำ)
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
