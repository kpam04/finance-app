const express = require('express');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Recurring = require('../models/Recurring');
const auth = require('../middleware/auth');
const { cleanCategoryName, cleanColor, cleanIcon, MAX_ACTIVE_CATEGORIES, MAX_TOTAL_CATEGORIES } = require('../utils/inputRules');

const router = express.Router();
router.use(auth);

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const serverError = (res, e) => { console.error(e); return fail(res, 500, 'เกิดข้อผิดพลาดของระบบ'); };

const toDto = (c) => ({
  category_id: c._id,
  name: c.name,
  type: c.type,
  icon: c.icon,
  color: c.color,
  is_default: c.isDefault ? 1 : 0,
  hidden: !!c.hidden,
});

// จำนวนหมวดของตัวเอง เทียบกับเพดาน (ส่งกลับให้หน้าเว็บแสดงตัวนับ "ใช้อยู่ 3/10")
const limitsOf = (own) => ({
  custom_active: own.filter((c) => !c.hidden).length,
  custom_total: own.length,
  max_active: MAX_ACTIVE_CATEGORIES,
  max_total: MAX_TOTAL_CATEGORIES,
});

const sameName = (type, name) => (c) => c.type === type && c.name.toLowerCase() === name.toLowerCase();

const MSG = {
  limitActive: `ใช้หมวดหมู่ของตัวเองได้ไม่เกิน ${MAX_ACTIVE_CATEGORIES} หมวด (ลบหรือซ่อนหมวดที่ไม่ใช้ก่อน)`,
  limitTotal: `มีหมวดหมู่ของตัวเองรวมที่ซ่อนอยู่ครบ ${MAX_TOTAL_CATEGORIES} หมวดแล้ว ลบหมวดที่ซ่อนอยู่ก่อนจึงจะสร้างเพิ่มได้`,
  duplicate: 'มีหมวดหมู่ชื่อนี้อยู่แล้ว',
  hiddenExists: 'มีหมวดหมู่ชื่อนี้ที่ซ่อนอยู่ กดแสดงอีกครั้งแทนการสร้างใหม่',
};

// หมวดของตัวเองที่ตรงกับ :id (หมวดมาตรฐานแก้/ลบไม่ได้)
async function findOwn(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 404, 'ไม่พบหมวดหมู่'); return null; }
  const cat = await Category.findOne({ _id: req.params.id, user: req.userId });
  if (!cat) { fail(res, 404, 'ไม่พบหมวดหมู่ (แก้ไขหรือลบได้เฉพาะหมวดที่คุณสร้างเอง)'); return null; }
  return cat;
}

// หมวดมาตรฐาน + หมวดของผู้ใช้เอง (ปกติไม่รวมหมวดที่ซ่อน ใส่ ?include_hidden=1 เพื่อรวม เช่น ตัวกรองรายการ)
router.get('/', async (req, res) => {
  try {
    const includeHidden = req.query.include_hidden === '1' || req.query.include_hidden === 'true';
    const cats = await Category.find({ $or: [{ user: null }, { user: req.userId }] })
      // หมวดมาตรฐานก่อน (รายจ่ายแล้วรายรับ ตามลำดับ sortOrder) ตามด้วยหมวดของผู้ใช้เอง เรียงตามชื่อ
      .sort({ isDefault: -1, type: 1, sortOrder: 1, name: 1 });
    const own = cats.filter((c) => c.user);
    const shown = includeHidden ? cats : cats.filter((c) => !c.hidden);
    res.json({ success: true, data: shown.map(toDto), meta: limitsOf(own) });
  } catch (e) {
    serverError(res, e);
  }
});

// หมวดของตัวเองทั้งหมด (รวมที่ซ่อน) พร้อมจำนวนที่ใช้อยู่ เพื่อแสดงในการ์ด "หมวดหมู่ของฉัน"
router.get('/mine', async (req, res) => {
  try {
    const own = await Category.find({ user: req.userId }).sort({ type: 1, name: 1 });
    const data = [];
    for (const c of own) {
      const [transactions, budgets, recurring] = await Promise.all([
        Transaction.countDocuments({ user: req.userId, category: c._id }),
        Budget.countDocuments({ user: req.userId, category: c._id }),
        Recurring.countDocuments({ user: req.userId, category: c._id }),
      ]);
      data.push({ ...toDto(c), usage: { transactions, budgets, recurring } });
    }
    res.json({ success: true, data, meta: limitsOf(own) });
  } catch (e) {
    serverError(res, e);
  }
});

// สร้างหมวดของตัวเอง
router.post('/', async (req, res) => {
  try {
    const nameCheck = cleanCategoryName(req.body.name);
    const type = req.body.type;
    const color = cleanColor(req.body.color);
    const icon = cleanIcon(req.body.icon);
    if (!['income', 'expense'].includes(type)) return fail(res, 400, 'ข้อมูลไม่ครบถ้วน');
    for (const c of [nameCheck, color, icon]) {
      if (c.error) return fail(res, 400, c.error);
    }
    const name = nameCheck.value;

    const all = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
    const same = all.filter(sameName(type, name));
    if (same.some((c) => !c.hidden)) return fail(res, 409, MSG.duplicate);
    const hiddenOwn = same.find((c) => c.user && c.hidden);
    if (hiddenOwn) return fail(res, 409, MSG.hiddenExists, { code: 'HIDDEN_EXISTS', category_id: hiddenOwn._id });

    const own = all.filter((c) => c.user);
    if (own.filter((c) => !c.hidden).length >= MAX_ACTIVE_CATEGORIES) return fail(res, 400, MSG.limitActive, { code: 'LIMIT_ACTIVE' });
    if (own.length >= MAX_TOTAL_CATEGORIES) return fail(res, 400, MSG.limitTotal, { code: 'LIMIT_TOTAL' });

    const cat = await Category.create({ user: req.userId, name, type, icon: icon.value, color: color.value, isDefault: false });
    res.status(201).json({
      success: true,
      message: 'เพิ่มหมวดหมู่สำเร็จ',
      data: { ...toDto(cat), category_id: cat._id },
    });
  } catch (e) {
    serverError(res, e);
  }
});

// แก้ชื่อ/สี (ประเภทแก้ไม่ได้ เหมือนกติกาล็อกประเภทรายการ)
router.put('/:id', async (req, res) => {
  try {
    const cat = await findOwn(req, res);
    if (!cat) return undefined;
    if (req.body.type !== undefined && req.body.type !== cat.type) return fail(res, 400, 'เปลี่ยนประเภทของหมวดหมู่ไม่ได้');

    let name = cat.name;
    let colorValue = cat.color;
    if (req.body.name !== undefined) {
      const c = cleanCategoryName(req.body.name);
      if (c.error) return fail(res, 400, c.error);
      name = c.value;
    }
    if (req.body.color !== undefined) {
      const c = cleanColor(req.body.color);
      if (c.error) return fail(res, 400, c.error);
      colorValue = c.value;
    }

    if (name.toLowerCase() !== cat.name.toLowerCase()) {
      const all = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
      const clash = all.find((c) => String(c._id) !== String(cat._id) && sameName(cat.type, name)(c));
      if (clash) return fail(res, 409, clash.hidden ? MSG.hiddenExists : MSG.duplicate);
    }

    await Category.updateOne({ _id: cat._id }, { $set: { name, color: colorValue } });
    const fresh = await Category.findOne({ _id: cat._id });
    res.json({ success: true, message: 'บันทึกการแก้ไขสำเร็จ', data: toDto(fresh) });
  } catch (e) {
    serverError(res, e);
  }
});

// เดือนปัจจุบันตามเวลาไทย (ใช้ตัดสินว่างบที่เหลืออยู่ยังใช้งานต่อหรือไม่)
const thaiNow = () => {
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return { month: t.getUTCMonth() + 1, year: t.getUTCFullYear() };
};

// ลบ: ยังมีงบ/รายการซ้ำที่ใช้อยู่ = ไม่ให้ลบ / เคยมีข้อมูลใช้ = ซ่อน / ไม่เคยใช้ = ลบจริง
router.delete('/:id', async (req, res) => {
  try {
    const cat = await findOwn(req, res);
    if (!cat) return undefined;

    const now = thaiNow();
    const latestBudget = await Budget.findOne({ user: req.userId, category: cat._id }).sort({ year: -1, month: -1 });
    const budgetActive = !!latestBudget && !latestBudget.stopped
      && (latestBudget.repeat !== false || latestBudget.year * 12 + latestBudget.month >= now.year * 12 + now.month);
    const recurringActive = await Recurring.countDocuments({ user: req.userId, category: cat._id, isActive: true });
    if (budgetActive || recurringActive) {
      const parts = [];
      if (budgetActive) parts.push('งบประมาณ');
      if (recurringActive) parts.push(`รายการซ้ำที่เปิดอยู่ ${recurringActive} รายการ`);
      return fail(res, 409, `ลบหมวดนี้ไม่ได้ เพราะยังมี${parts.join('และ')}ใช้หมวดนี้อยู่ ปิดหรือลบก่อน`, {
        code: 'IN_USE',
        blocking: { budgets: budgetActive ? 1 : 0, recurring: recurringActive },
      });
    }

    const [tx, bud, rec] = await Promise.all([
      Transaction.countDocuments({ user: req.userId, category: cat._id }),
      Budget.countDocuments({ user: req.userId, category: cat._id }),
      Recurring.countDocuments({ user: req.userId, category: cat._id }),
    ]);
    if (tx + bud + rec === 0) {
      await Category.deleteOne({ _id: cat._id });
      return res.json({ success: true, action: 'deleted', message: 'ลบหมวดหมู่แล้ว' });
    }
    if (cat.hidden) {
      return res.json({ success: true, action: 'hidden', already_hidden: true, message: 'หมวดนี้ยังมีข้อมูลเก่าใช้อยู่ จึงลบถาวรไม่ได้ (ซ่อนอยู่แล้ว)' });
    }
    await Category.updateOne({ _id: cat._id }, { $set: { hidden: true } });
    res.json({ success: true, action: 'hidden', message: 'ซ่อนหมวดหมู่แล้ว (รายการเดิมยังแสดงชื่อหมวดนี้ตามเดิม) กดแสดงอีกครั้งได้ในหน้าโปรไฟล์' });
  } catch (e) {
    serverError(res, e);
  }
});

// แสดงหมวดที่ซ่อนอีกครั้ง
router.post('/:id/restore', async (req, res) => {
  try {
    const cat = await findOwn(req, res);
    if (!cat) return undefined;
    if (!cat.hidden) return fail(res, 400, 'หมวดนี้ไม่ได้ซ่อนอยู่');

    const all = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
    const own = all.filter((c) => c.user);
    if (own.filter((c) => !c.hidden).length >= MAX_ACTIVE_CATEGORIES) return fail(res, 400, MSG.limitActive, { code: 'LIMIT_ACTIVE' });
    if (all.some((c) => String(c._id) !== String(cat._id) && !c.hidden && sameName(cat.type, cat.name)(c))) {
      return fail(res, 409, 'มีหมวดหมู่ชื่อนี้อยู่แล้ว เปลี่ยนชื่อหมวดที่ซ่อนอยู่ก่อนจึงจะแสดงอีกครั้งได้');
    }
    await Category.updateOne({ _id: cat._id }, { $set: { hidden: false } });
    const fresh = await Category.findOne({ _id: cat._id });
    res.json({ success: true, message: 'แสดงหมวดหมู่อีกครั้งแล้ว', data: toDto(fresh) });
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
