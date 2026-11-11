const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Installment = require('../models/Installment');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const checkBudgetAlert = require('../services/budgetAlert');
const { parseAmount, MAX_AMOUNT } = require('../utils/inputRules');
const { bangkokToday, validIso } = require('../services/plan/dateUtil');
const I = require('../services/installments');

// รายการผ่อน: เพิ่ม/แก้/ลบแผนผ่อน, ดูบิลของเดือน, กด "จ่ายแล้ว" (ระบบบันทึกรายจ่ายตามหมวดของแต่ละชิ้น)
const router = express.Router();
router.use(auth);

const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
const len = (s) => Array.from(s).length;
const monthIdx = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1; };

function cleanText(raw, label, max, { required = false } = {}) {
  if (raw === undefined || raw === null) raw = '';
  if (typeof raw !== 'string') return { error: `${label}ไม่ถูกต้อง` };
  const s = raw.trim().replace(/\s+/g, ' ');
  if (required && !s) return { error: `กรุณากรอก${label}` };
  if (len(s) > max) return { error: `${label}ต้องไม่เกิน ${max} ตัวอักษร` };
  if (/[\u0000-\u001f\u007f<>]/.test(s)) return { error: `${label}มีอักขระที่ไม่อนุญาต` };
  return { value: s };
}
function parseInt0(raw, label, min, max) {
  const n = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  if (!Number.isInteger(n) || n < min || n > max) return { error: `${label}ต้องเป็นจำนวนเต็ม ${min}–${max}` };
  return { value: n };
}
function parseMoney0(raw, label) {
  if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') return { value: 0 };
  return parseAmount(raw, label);
}

async function loadPlans(userId) {
  return Installment.find({ user: userId }).sort({ createdAt: 1 }).lean();
}
async function overview(userId) {
  const todayIso = bangkokToday();
  const plans = await loadPlans(userId);
  return {
    today: todayIso,
    summary: I.summaryOf(plans, todayIso),
    bills: I.billsOf(plans, todayIso),
    plans: plans.filter((p) => p.status === 'active').map((p) => I.planOut(p, todayIso)),
    done: plans.filter((p) => p.status === 'done').sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0)).map((p) => I.planOut(p, todayIso)),
    channels: I.CHANNELS,
    max_active: I.MAX_ACTIVE_PLANS,
  };
}

// ตรวจฟอร์มแผนผ่อน คืน { value: { ...ฟิลด์, schedule } } หรือ { error }
async function validatePlan(b, userId, { todayIso, keepPaid = null } = {}) {
  const out = {};
  const name = cleanText(b.name, 'ชื่อสินค้า', 60, { required: true });
  if (name.error) return name;
  out.name = name.value;
  if (!Object.prototype.hasOwnProperty.call(I.CHANNELS, b.channel)) return { error: 'กรุณาเลือกช่องทางผ่อน' };
  out.channel = b.channel;
  const cn = cleanText(b.channel_name, 'ชื่อบัตร/ร้าน', 40);
  if (cn.error) return cn;
  out.channel_name = cn.value;
  if (b.channel === 'other' && !out.channel_name) return { error: 'กรุณาระบุชื่อช่องทางผ่อน' };
  if (!mongoose.isValidObjectId(b.category_id)) return { error: 'กรุณาเลือกหมวด' };
  const cat = await Category.findOne({ _id: b.category_id, $or: [{ user: null }, { user: userId }] }).lean();
  if (!cat || (cat.type && cat.type !== 'expense')) return { error: 'หมวดต้องเป็นหมวดรายจ่าย' };
  out.category = cat._id;
  const dd = parseInt0(b.due_day, 'วันครบกำหนด', 1, 31);
  if (dd.error) return dd;
  out.due_day = dd.value;
  if (keepPaid) return { value: out }; // มีงวดที่จ่ายผ่านแอปแล้ว: แก้ได้เฉพาะข้อมูลทั่วไป

  const price = parseAmount(b.price, 'ราคาสินค้า');
  if (price.error) return price;
  out.price = price.value;
  const down = parseMoney0(b.down_payment, 'เงินดาวน์');
  if (down.error) return down;
  if (down.value >= out.price) return { error: 'เงินดาวน์ต้องน้อยกว่าราคาสินค้า' };
  out.down_payment = down.value;
  const months = parseInt0(b.months, 'จำนวนงวด', 1, I.MAX_MONTHS);
  if (months.error) return months;
  out.months = months.value;
  if (typeof b.first_month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.first_month)) return { error: 'เดือนของงวดแรกไม่ถูกต้อง' };
  const cur = monthIdx(todayIso.slice(0, 7));
  const fm = monthIdx(b.first_month);
  if (fm < cur - I.MAX_MONTHS || fm > cur + 12) return { error: 'เดือนของงวดแรกต้องไม่เกิน 12 เดือนข้างหน้า และไม่ย้อนหลังเกิน 5 ปี' };
  out.first_month = b.first_month;
  out.equal = b.equal !== false;

  let amounts;
  out.total_payable = null;
  if (out.equal) {
    const per = parseAmount(b.per_amount, 'ยอดต่องวด');
    if (per.error) return per;
    if (b.total_payable !== undefined && b.total_payable !== null && b.total_payable !== '') {
      const tot = parseAmount(b.total_payable, 'ยอดรวมที่ต้องจ่าย');
      if (tot.error) return tot;
      const last = I.round2(tot.value - per.value * (out.months - 1));
      if (last <= 0) return { error: 'ยอดรวมที่ต้องจ่ายน้อยกว่ายอดต่องวดรวมกัน ลองตรวจตัวเลขอีกครั้ง' };
      out.total_payable = tot.value;
    }
    amounts = I.buildAmounts({ months: out.months, per: per.value, total: out.total_payable, equal: true });
  } else {
    if (!Array.isArray(b.amounts) || b.amounts.length !== out.months) return { error: 'กรุณากรอกยอดให้ครบทุกงวด' };
    amounts = [];
    for (let i = 0; i < b.amounts.length; i += 1) {
      const a = parseAmount(b.amounts[i], `ยอดงวดที่ ${i + 1} `);
      if (a.error) return a;
      amounts.push(a.value);
    }
  }
  if (amounts.reduce((s, a) => s + a, 0) > MAX_AMOUNT) return { error: 'ยอดรวมสูงเกินไป' };
  const pre = parseInt0(b.prepaid_count === undefined || b.prepaid_count === '' ? 0 : b.prepaid_count, 'จำนวนงวดที่จ่ายไปแล้ว', 0, out.months - 1);
  if (pre.error) return { error: `จ่ายไปแล้วได้ไม่เกิน ${out.months - 1} งวด (ต้องเหลืออย่างน้อย 1 งวด)` };
  out.schedule = amounts.map((a, i) => ({ n: i + 1, amount: a, paid: i < pre.value, prepaid: i < pre.value, paid_amount: i < pre.value ? a : null }));
  return { value: out, warnings: I.scheduleWarnings(amounts) };
}

router.get('/', async (req, res) => {
  try {
    res.json({ success: true, data: await overview(req.userId) });
  } catch (e) {
    console.error('[installments]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.post('/', async (req, res) => {
  try {
    const todayIso = bangkokToday();
    if ((await Installment.countDocuments({ user: req.userId, status: 'active' })) >= I.MAX_ACTIVE_PLANS) return fail(res, 400, `มีรายการที่กำลังผ่อนได้สูงสุด ${I.MAX_ACTIVE_PLANS} รายการ`);
    const v = await validatePlan(req.body || {}, req.userId, { todayIso });
    if (v.error) return fail(res, 400, v.error);
    const created = await Installment.create({ user: req.userId, ...v.value });
    res.status(201).json({ success: true, message: 'เพิ่มรายการผ่อนแล้ว', data: { plan: I.planOut(created.toObject(), todayIso), warnings: v.warnings || [] } });
  } catch (e) {
    console.error('[installments/create]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ไม่พบรายการผ่อน');
    const plan = await Installment.findOne({ _id: req.params.id, user: req.userId }).lean();
    if (!plan) return fail(res, 404, 'ไม่พบรายการผ่อน');
    const todayIso = bangkokToday();
    const appPaid = plan.schedule.some((it) => it.paid && !it.prepaid);
    const v = await validatePlan(req.body || {}, req.userId, { todayIso, keepPaid: appPaid });
    if (v.error) return fail(res, 400, v.error);
    await Installment.updateOne({ _id: plan._id }, { $set: v.value });
    const fresh = await Installment.findById(plan._id).lean();
    // จำนวนงวดที่ยังไม่จ่ายเหลือ 0 (เช่น แก้จำนวนงวดที่จ่ายไปแล้ว) → ผ่อนเสร็จ
    const open = I.effectiveSchedule(fresh).items.filter(I.isOpenItem);
    if (!open.length && fresh.status === 'active') await Installment.updateOne({ _id: plan._id }, { $set: { status: 'done', closed_at: new Date() } });
    res.json({ success: true, message: appPaid ? 'บันทึกแล้ว (มีงวดที่จ่ายผ่านแอปแล้ว จึงแก้ได้เฉพาะชื่อ ช่องทาง หมวด และวันครบกำหนด)' : 'บันทึกการแก้ไขแล้ว', data: { plan: I.planOut(fresh, todayIso), warnings: v.warnings || [] } });
  } catch (e) {
    console.error('[installments/update]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ลบแผนผ่อน: รายการรายจ่ายที่บันทึกไปแล้วยังอยู่ (เลิกผูกกับแผน)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ไม่พบรายการผ่อน');
    const r = await Installment.deleteOne({ _id: req.params.id, user: req.userId });
    if (!r.deletedCount) return fail(res, 404, 'ไม่พบรายการผ่อน');
    await Transaction.updateMany({ user: req.userId, installment: req.params.id }, { $set: { installment: null, installment_n: null } });
    res.json({ success: true, message: 'ลบรายการผ่อนแล้ว (รายการรายจ่ายที่บันทึกไปแล้วยังอยู่)' });
  } catch (e) {
    console.error('[installments/delete]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// กด "จ่ายแล้ว": items = [{ plan_id, n, amount }] date = วันที่จ่าย
router.post('/pay', async (req, res) => {
  try {
    const b = req.body || {};
    const todayIso = bangkokToday();
    if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) return fail(res, 400, 'ไม่มีงวดที่จะจ่าย');
    const date = b.date === undefined || b.date === '' ? todayIso : b.date;
    if (!validIso(date) || date > todayIso) return fail(res, 400, 'วันที่จ่ายไม่ถูกต้อง (ต้องไม่เป็นวันในอนาคต)');
    if (date < `${Number(todayIso.slice(0, 4)) - 1}${todayIso.slice(4)}`) return fail(res, 400, 'วันที่จ่ายย้อนหลังได้ไม่เกิน 1 ปี');

    // ตรวจทั้งหมดก่อน แล้วค่อยบันทึก
    const plans = new Map();
    const work = [];
    for (const raw of b.items) {
      if (!raw || !mongoose.isValidObjectId(raw.plan_id)) return fail(res, 400, 'ข้อมูลงวดไม่ถูกต้อง');
      let plan = plans.get(String(raw.plan_id));
      if (!plan) {
        plan = await Installment.findOne({ _id: raw.plan_id, user: req.userId, status: 'active' }).lean();
        if (!plan) return fail(res, 404, 'ไม่พบรายการผ่อน หรือผ่อนเสร็จแล้ว');
        plans.set(String(raw.plan_id), plan);
      }
      const item = plan.schedule.find((it) => it.n === raw.n);
      if (!item || item.paid) return fail(res, 400, `งวดที่ ${raw.n} ของ ${plan.name} จ่ายไปแล้ว หรือไม่มีงวดนี้`);
      const amt = parseAmount(raw.amount, `ยอดของ ${plan.name}`);
      if (amt.error) return fail(res, 400, amt.error);
      item.paid = true; item.paid_amount = amt.value; // จำลองก่อน เพื่อตรวจว่างวดสุดท้ายจ่ายครบ
      work.push({ plan, n: raw.n, amount: amt.value });
    }
    for (const plan of plans.values()) {
      const { items, leftover } = I.effectiveSchedule(plan);
      if (leftover > 0 && !items.some(I.isOpenItem)) return fail(res, 400, `${plan.name}: งวดสุดท้ายต้องจ่ายให้ครบยอด (ยังขาด ฿${leftover.toLocaleString('th-TH')})`);
    }

    const when = new Date(`${date}T00:00:00.000Z`);
    const created = [];
    for (const w of work) {
      const t = await Transaction.create({
        user: req.userId, category: w.plan.category, type: 'expense', amount: w.amount, date: when,
        note: `ผ่อน ${w.plan.name} งวด ${w.n}/${w.plan.months} (${I.channelLabel(w.plan)})`.slice(0, 200),
        installment: w.plan._id, installment_n: w.n,
      });
      created.push(t);
      await Installment.updateOne(
        { _id: w.plan._id, schedule: { $elemMatch: { n: w.n, paid: false } } },
        { $set: { 'schedule.$.paid': true, 'schedule.$.paid_amount': w.amount, 'schedule.$.paid_at': when, 'schedule.$.transaction': t._id } },
      );
    }
    for (const plan of plans.values()) {
      const fresh = await Installment.findById(plan._id).lean();
      if (!I.effectiveSchedule(fresh).items.some(I.isOpenItem)) await Installment.updateOne({ _id: plan._id }, { $set: { status: 'done', closed_at: new Date() } });
    }
    const cats = new Set(work.map((w) => String(w.plan.category)));
    for (const c of cats) await checkBudgetAlert(req.userId, c, when);
    res.json({ success: true, message: `บันทึกการจ่ายแล้ว ${created.length} รายการ`, data: await overview(req.userId) });
  } catch (e) {
    console.error('[installments/pay]', e.message);
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

module.exports = router;
// ใช้ใน routes/transactions.js: ลบ/แก้ยอดรายการที่มาจากงวดผ่อน → ปรับสถานะงวดให้ตรง
module.exports.syncFromTransaction = async function syncFromTransaction(t, { deleted = false } = {}) {
  if (!t || !t.installment || !t.installment_n) return;
  const set = deleted
    ? { 'schedule.$.paid': false, 'schedule.$.paid_amount': null, 'schedule.$.paid_at': null, 'schedule.$.transaction': null, status: 'active', closed_at: null }
    : { 'schedule.$.paid_amount': t.amount };
  await Installment.updateOne({ _id: t.installment, user: t.user, 'schedule.n': t.installment_n }, { $set: set });
  if (!deleted) {
    const fresh = await Installment.findById(t.installment).lean();
    if (fresh) {
      const open = I.effectiveSchedule(fresh).items.some(I.isOpenItem);
      if (open && fresh.status === 'done') await Installment.updateOne({ _id: fresh._id }, { $set: { status: 'active', closed_at: null } });
      if (!open && fresh.status === 'active') await Installment.updateOne({ _id: fresh._id }, { $set: { status: 'done', closed_at: new Date() } });
    }
  }
};
