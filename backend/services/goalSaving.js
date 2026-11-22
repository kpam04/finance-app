const Goal = require('../models/Goal');
const Transaction = require('../models/Transaction');
const { MAX_AMOUNT } = require('../utils/inputRules');

// การออม/ถอนของเป้าหมาย เก็บเป็นรายการ (Transaction) ชนิด saving / withdraw
//  - ไม่ใช่รายรับ-รายจ่าย: ไม่นับในรายจ่าย งบ หรือการวิเคราะห์ แต่หักออก/คืนเข้าเงินคงเหลือ
//  - ยอดปัจจุบันของเป้าเก็บที่ Goal.saved_amount (ยอดตั้งต้นตอนสร้าง + ออม - ถอน) ปรับด้วย $inc ทุกครั้งที่รายการเปลี่ยน
//  - สร้างได้จากหน้าเป้าหมายเท่านั้น / หน้ารายการแก้ได้แค่จำนวนเงินกับวันที่ หรือลบ (เฉพาะเป้าที่กำลังออม)
const SAVING_TYPES = ['saving', 'withdraw'];
const REASON_MAX = 100;

class SavingError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isDone = (g) => !!(g && g.completed_at);

// วันนี้ตามเวลาไทย (เที่ยงคืน UTC ของวันนั้น แบบเดียวกับ Transaction.date)
function todayTH() {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate()));
}

// ผลต่อยอดในเป้า: ออม = +, ถอน = -
const effect = (type, amount) => (type === 'withdraw' ? -amount : amount);

function cleanReason(raw) {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'เหตุผลไม่ถูกต้อง' };
  const s = raw.trim().replace(/\s+/g, ' ');
  if (Array.from(s).length > REASON_MAX) return { error: `เหตุผลต้องไม่เกิน ${REASON_MAX} ตัวอักษร` };
  if (/[\u0000-\u001f\u007f<>]/.test(s)) return { error: 'เหตุผลมีอักขระที่ไม่อนุญาต' };
  return { value: s };
}

// ปรับยอดในเป้า แล้วปิดเป็น "สำเร็จแล้ว" ถ้าถึงยอดเป้าหมาย คืน { goal (ล่าสุด), justCompleted }
async function applyDelta(goal, delta) {
  const fresh = await Goal.findOneAndUpdate({ _id: goal._id }, { $inc: { saved_amount: delta } }, { returnDocument: 'after' }).lean();
  if (!fresh) return { goal: null, justCompleted: false };
  const fixed = Math.max(0, round2(fresh.saved_amount));
  const set = {};
  if (fixed !== fresh.saved_amount) set.saved_amount = fixed;
  const justCompleted = !isDone(fresh) && fixed >= Number(fresh.target_amount);
  if (justCompleted) set.completed_at = new Date();
  if (Object.keys(set).length) {
    await Goal.updateOne({ _id: goal._id }, { $set: set });
    Object.assign(fresh, set);
  }
  return { goal: fresh, justCompleted };
}

async function activeGoal(userId, goalId) {
  const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
  if (!goal) throw new SavingError('ไม่พบเป้าหมาย', 404);
  if (isDone(goal)) throw new SavingError('เป้าหมายนี้สำเร็จแล้ว');
  return goal;
}

// ออมเพิ่ม (วันที่ = วันนี้)
async function addSaving(userId, goalId, amount) {
  const goal = await activeGoal(userId, goalId);
  if (round2(Number(goal.saved_amount) + amount) > MAX_AMOUNT) throw new SavingError(`ยอดที่ออมแล้วรวมต้องไม่เกิน ${MAX_AMOUNT.toLocaleString('en-US')} บาท`);
  const t = await Transaction.create({ user: userId, type: 'saving', amount, date: todayTH(), goal: goal._id, goal_name: goal.name });
  const r = await applyDelta(goal, amount);
  return { transaction: t, ...r };
}

// ถอนออก (วันที่ = วันนี้) ถอนได้ไม่เกินยอดในเป้า
async function withdraw(userId, goalId, amount, rawReason) {
  const goal = await activeGoal(userId, goalId);
  const reason = cleanReason(rawReason);
  if (reason.error) throw new SavingError(reason.error);
  if (amount > round2(goal.saved_amount)) throw new SavingError(`ถอนได้ไม่เกินยอดที่ออมไว้ ${Number(goal.saved_amount).toLocaleString('en-US')} บาท`);
  const t = await Transaction.create({ user: userId, type: 'withdraw', amount, date: todayTH(), goal: goal._id, goal_name: goal.name, reason: reason.value });
  const r = await applyDelta(goal, -amount);
  return { transaction: t, ...r };
}

// รายการออม/ถอนแก้หรือลบได้เฉพาะเมื่อเป้ายังกำลังออมอยู่
async function editableGoal(userId, t) {
  const goal = t.goal ? await Goal.findOne({ _id: t.goal, user: userId }).lean() : null;
  if (!goal) throw new SavingError('เป้าหมายของรายการนี้ถูกลบแล้ว แก้ไขหรือลบไม่ได้');
  if (isDone(goal)) throw new SavingError('เป้าหมายนี้สำเร็จแล้ว รายการออมดูได้อย่างเดียว');
  return goal;
}

// แก้จำนวนเงิน/วันที่ (หมวด เป้า และเหตุผลแก้ไม่ได้)
async function editSaving(userId, t, { amount, date }) {
  const goal = await editableGoal(userId, t);
  let delta = 0;
  if (amount !== undefined && amount !== t.amount) {
    delta = effect(t.type, amount) - effect(t.type, t.amount);
    const next = round2(Number(goal.saved_amount) + delta);
    if (next < 0) throw new SavingError(t.type === 'withdraw' ? 'ยอดถอนเกินยอดที่ออมไว้ในเป้า' : 'แก้ไม่ได้ เพราะยอดในเป้าจะติดลบ (มีการถอนออกไปแล้ว)');
    if (next > MAX_AMOUNT) throw new SavingError(`ยอดที่ออมแล้วรวมต้องไม่เกิน ${MAX_AMOUNT.toLocaleString('en-US')} บาท`);
    t.amount = amount;
  }
  if (date) t.date = date;
  await t.save();
  return delta ? applyDelta(goal, delta) : { goal, justCompleted: false };
}

// ลบรายการออม/ถอน (กรอกผิด): ยอดในเป้าปรับกลับ เงินคงเหลือกลับคืนเอง (คำนวณจากรายการ)
async function deleteSaving(userId, t) {
  const goal = await editableGoal(userId, t);
  const delta = -effect(t.type, t.amount);
  if (round2(Number(goal.saved_amount) + delta) < 0) throw new SavingError('ลบไม่ได้ เพราะยอดในเป้าจะติดลบ (มีการถอนออกไปแล้ว)');
  await Transaction.deleteOne({ _id: t._id, user: userId });
  return applyDelta(goal, delta);
}

// ยอดสุทธิที่ออมผ่านรายการ (ออม - ถอน) ไม่รวมยอดตั้งต้นตอนสร้างเป้า
async function netSaved(userId, goalId) {
  const rows = await Transaction.find({ user: userId, goal: goalId, type: { $in: SAVING_TYPES } }).select('type amount').lean();
  return round2(rows.reduce((s, r) => s + effect(r.type, r.amount), 0));
}

// ลบเป้า: กำลังออม (เลิกเป้า) = ถอนยอดที่ออมผ่านรายการกลับเข้าเงินคงเหลือ / สำเร็จแล้ว = รายการเดิมอยู่ครบ เงินไม่กลับมา
async function deleteGoal(userId, goalId) {
  const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
  if (!goal) throw new SavingError('ไม่พบเป้าหมาย', 404);
  let returned = 0;
  if (!isDone(goal)) {
    returned = await netSaved(userId, goal._id);
    if (returned > 0) {
      await Transaction.create({ user: userId, type: 'withdraw', amount: returned, date: todayTH(), goal: goal._id, goal_name: goal.name, reason: 'เลิกเป้าหมายนี้' });
    }
  }
  await Goal.deleteOne({ _id: goal._id, user: userId });
  return { returned, wasDone: isDone(goal) };
}

// ---------- จ่ายจากเงินออม (รายจ่ายที่ใช้เงินของเป้าที่สำเร็จแล้ว) ----------
// ยอดที่ใช้ไปของแต่ละเป้า = ผลรวม goal_used ของรายจ่ายที่ผูกกับเป้านั้น (คำนวณสด ลบ/แก้รายจ่ายแล้วยอดคืนเข้าเป้าเอง)
// เงินคงเหลือ: รายจ่ายนับเต็มจำนวน แต่ส่วนที่ดึงจากเป้า (goal_used) บวกกลับ เพราะหักไปแล้วตอนออม
async function usedByGoal(userId, goalIds, excludeTxId) {
  if (!goalIds.length) return new Map();
  const q = { user: userId, type: 'expense', goal: { $in: goalIds } };
  const rows = await Transaction.find(q).select('_id goal goal_used').lean();
  const m = new Map();
  for (const r of rows) {
    if (excludeTxId && String(r._id) === String(excludeTxId)) continue;
    m.set(String(r.goal), round2((m.get(String(r.goal)) || 0) + (Number(r.goal_used) || 0)));
  }
  return m;
}

// เป้าที่สำเร็จแล้วและยังมีเงินเหลือให้ใช้ [{ goal_id, name, remaining }] (excludeTxId = ตอนแก้รายจ่าย: นับยอดของรายการนี้คืนก่อน)
async function usableGoals(userId, excludeTxId) {
  const goals = await Goal.find({ user: userId, completed_at: { $ne: null } }).sort({ completed_at: -1 }).lean();
  const used = await usedByGoal(userId, goals.map((g) => g._id), excludeTxId);
  return goals
    .map((g) => ({ goal_id: String(g._id), name: g.name, saved: round2(g.saved_amount), used: used.get(String(g._id)) || 0 }))
    .map((g) => ({ ...g, remaining: Math.max(0, round2(g.saved - g.used)) }))
    .filter((g) => g.remaining > 0);
}

// คำนวณการจ่ายจากเงินออม: คืน { goal, goal_name, goal_used } (ดึงได้ไม่เกินยอดที่เหลือในเป้า ส่วนเกินหักจากเงินคงเหลือตามปกติ)
async function goalFund(userId, goalId, amount, excludeTxId) {
  if (!goalId) return { goal: null, goal_name: '', goal_used: 0 };
  const goal = await Goal.findOne({ _id: goalId, user: userId }).lean();
  if (!goal) throw new SavingError('ไม่พบเป้าหมายที่เลือกจ่ายจากเงินออม', 400);
  if (!isDone(goal)) throw new SavingError('จ่ายจากเงินออมได้เฉพาะเป้าที่สำเร็จแล้ว');
  const used = (await usedByGoal(userId, [goal._id], excludeTxId)).get(String(goal._id)) || 0;
  const remaining = Math.max(0, round2(Number(goal.saved_amount) - used));
  if (remaining <= 0) throw new SavingError(`เงินออมของเป้า "${goal.name}" ใช้ครบแล้ว`);
  return { goal: goal._id, goal_name: goal.name, goal_used: round2(Math.min(amount, remaining)) };
}

module.exports = { usedByGoal, usableGoals, goalFund, SavingError, SAVING_TYPES, REASON_MAX, addSaving, withdraw, editSaving, deleteSaving, deleteGoal, netSaved, cleanReason, todayTH };
