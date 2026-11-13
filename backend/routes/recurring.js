const express = require('express');
const mongoose = require('mongoose');
const Recurring = require('../models/Recurring');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const { parseAmount, cleanNote, yearInRange } = require('../utils/inputRules');
const { runDueRecurring, nextOnOrAfter, todayTH } = require('../services/recurringRunner');
const { suggestionsFor, keyOf } = require('../services/recurringSuggest');
const RecurringDismiss = require('../models/RecurringDismiss');

const router = express.Router();
router.use(auth);

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
const ymd = (d) => (d ? d.toISOString().slice(0, 10) : null);

// 'YYYY-MM-DD' -> Date (UTC เที่ยงคืน) ถ้ารูปแบบผิดคืน null
function parseDateOnly(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

const toDto = (r) => ({
  recurring_id: r._id,
  type: r.type,
  amount: r.amount,
  note: r.note,
  frequency: r.frequency,
  start_date: ymd(r.startDate),
  end_date: ymd(r.endDate),
  next_run_date: ymd(r.nextRun),
  is_active: r.isActive ? 1 : 0,
  category_id: r.category && r.category._id,
  category_name: r.category && r.category.name,
  category_color: r.category && r.category.color,
});

// หมวดต้องเป็นหมวดมาตรฐานหรือของผู้ใช้ และต้องตรงกับประเภทรายการ
async function categoryOk(categoryId, userId, type) {
  if (!mongoose.isValidObjectId(categoryId)) return false;
  const c = await Category.findOne({ _id: categoryId, $or: [{ user: null }, { user: userId }] });
  return !!c && c.type === type;
}

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'รหัสรายการที่เกิดซ้ำไม่ถูกต้อง' });
  }
  next();
});

// รายจ่ายที่น่าจะเป็นรายการประจำ (จดเองทุกเดือน ยังไม่ได้ตั้งเป็นรายการเกิดซ้ำ)
router.get('/suggestions', async (req, res) => {
  try {
    const data = await suggestionsFor(req.userId, ymd(todayTH()));
    res.json({ success: true, data });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ผู้ใช้ตอบ "ไม่ใช่" → ไม่ชวนกลุ่มนี้อีก
router.post('/suggestions/dismiss', async (req, res) => {
  try {
    const key = typeof req.body.key === 'string' ? req.body.key.trim().slice(0, 200) : '';
    const [cat] = key.split('|');
    if (!key.includes('|') || !mongoose.isValidObjectId(cat)) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
    await RecurringDismiss.updateOne({ user: req.userId, key }, { $setOnInsert: { user: req.userId, key } }, { upsert: true });
    res.json({ success: true, message: 'รับทราบ จะไม่ชวนรายการนี้อีก' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ดูรายการที่เกิดซ้ำทั้งหมด
router.get('/', async (req, res) => {
  try {
    const rows = await Recurring.find({ user: req.userId })
      .populate('category', 'name color')
      .sort({ nextRun: 1 });
    res.json({ success: true, data: rows.filter((r) => r.category).map(toDto) });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// สร้างกฎใหม่ (ถ้าวันเริ่มต้นถึงแล้ว จะสร้างรายการรอบแรกให้ทันที)
router.post('/', async (req, res) => {
  try {
    const { type, category_id, frequency } = req.body;
    const amt = parseAmount(req.body.amount);
    const noteCheck = cleanNote(req.body.note);
    const start = parseDateOnly(req.body.start_date);
    const end = req.body.end_date ? parseDateOnly(req.body.end_date) : null;

    if (!['income', 'expense'].includes(type) || !FREQS.includes(frequency) || !start || !yearInRange(start)) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง' });
    }
    if (amt.error) return res.status(400).json({ success: false, message: amt.error });
    if (noteCheck.error) return res.status(400).json({ success: false, message: noteCheck.error });
    if (end && !yearInRange(end)) {
      return res.status(400).json({ success: false, message: 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง' });
    }
    const amount = amt.value;
    const note = noteCheck.value;
    if (req.body.end_date && !end) {
      return res.status(400).json({ success: false, message: 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง' });
    }
    if (end && end < start) {
      return res.status(400).json({ success: false, message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น' });
    }
    if (!(await categoryOk(category_id, req.userId, type))) {
      return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้องหรือไม่ตรงกับประเภทรายการ' });
    }

    const rule = await Recurring.create({
      user: req.userId,
      category: category_id,
      type,
      amount,
      note,
      frequency,
      startDate: start,
      endDate: end,
      nextRun: start,
    });

    const run = start <= todayTH() ? await runDueRecurring({ userId: req.userId }) : { created: 0 };

    res.status(201).json({
      success: true,
      message: 'สร้างรายการที่เกิดซ้ำสำเร็จ',
      data: { recurring_id: rule._id, created_now: run.created },
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// สั่งรันรายการที่ถึงกำหนดของผู้ใช้คนนี้ทันที (ใช้ทดสอบ/ปุ่ม "รันตอนนี้")
router.post('/run-due', async (req, res) => {
  try {
    const run = await runDueRecurring({ userId: req.userId });
    res.json({
      success: true,
      message: `ประมวลผล ${run.rules} กฎ สร้างรายการใหม่ ${run.created} รายการ`,
      data: run,
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// แก้ไขกฎ (ส่งเฉพาะ field ที่ต้องการแก้)
router.put('/:id', async (req, res) => {
  try {
    const r = await Recurring.findOne({ _id: req.params.id, user: req.userId });
    if (!r) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่เกิดซ้ำ' });

    const b = req.body;
    let changed = false;

    if ('type' in b) {
      if (!['income', 'expense'].includes(b.type)) {
        return res.status(400).json({ success: false, message: 'ประเภทไม่ถูกต้อง' });
      }
      // ประเภท (รายรับ/รายจ่าย) เปลี่ยนไม่ได้หลังสร้างกฎ ส่งประเภทเดิมมาได้ (หน้าเว็บส่งทั้งฟอร์ม)
      if (b.type !== r.type) {
        return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนประเภทได้ กรุณาลบกฎแล้วเพิ่มใหม่' });
      }
    }
    if ('category_id' in b) {
      r.category = b.category_id; changed = true;
    }
    if ('amount' in b) {
      const amt = parseAmount(b.amount);
      if (amt.error) return res.status(400).json({ success: false, message: amt.error });
      r.amount = amt.value; changed = true;
    }
    if ('note' in b) {
      const noteCheck = cleanNote(b.note);
      if (noteCheck.error) return res.status(400).json({ success: false, message: noteCheck.error });
      r.note = noteCheck.value; changed = true;
    }
    if ('frequency' in b) {
      if (!FREQS.includes(b.frequency)) {
        return res.status(400).json({ success: false, message: 'ความถี่ไม่ถูกต้อง' });
      }
      r.frequency = b.frequency; changed = true;
    }
    if ('end_date' in b) {
      if (b.end_date) {
        const end = parseDateOnly(b.end_date);
        if (!end) return res.status(400).json({ success: false, message: 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง' });
        if (end < r.startDate) {
          return res.status(400).json({ success: false, message: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น' });
        }
        r.endDate = end;
      } else {
        r.endDate = null;
      }
      changed = true;
    }
    if ('is_active' in b) {
      const next = b.is_active === true || b.is_active === 1 || b.is_active === '1';
      // เปิดใช้งานกฎที่หยุดไว้: ข้ามรอบที่ผ่านไปตอนหยุด ไม่สร้างย้อนหลัง
      if (next && !r.isActive) r.nextRun = nextOnOrAfter(r, todayTH());
      r.isActive = next;
      changed = true;
    }

    if (!changed) {
      return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลให้แก้ไข' });
    }
    if (!(await categoryOk(r.category, req.userId, r.type))) {
      return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้องหรือไม่ตรงกับประเภทรายการ' });
    }

    await r.save();
    res.json({ success: true, message: 'แก้ไขรายการสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ลบกฎ (รายการที่สร้างไปแล้วยังอยู่ แต่ตัดการผูกกับกฎ)
router.delete('/:id', async (req, res) => {
  try {
    const rule = await Recurring.findOneAndDelete({ _id: req.params.id, user: req.userId }).lean();
    if (!rule) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการที่เกิดซ้ำ' });
    }
    await Transaction.updateMany({ user: req.userId, recurring: req.params.id }, { recurring: null });
    // รายการที่กฎนี้สร้างไว้กลายเป็นรายการธรรมดา → ระบบจะเห็นเป็นรายจ่ายรายเดือนแล้วชวนตั้งใหม่ทันที
    // ผู้ใช้ตั้งใจลบเอง จึงนับเหมือนตอบ "ไม่ใช่" (ไม่ชวนอีก)
    if (rule.type === 'expense' && rule.frequency === 'monthly' && String(rule.note || '').trim()) {
      const key = keyOf(String(rule.category), rule.note);
      await RecurringDismiss.updateOne({ user: req.userId, key }, { $setOnInsert: { user: req.userId, key } }, { upsert: true }).catch(() => {});
    }
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;
