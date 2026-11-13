const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');
const auth = require('../middleware/auth');
const checkBudgetAlert = require('../services/budgetAlert');
const { parseAmount, cleanNote, yearInRange } = require('../utils/inputRules');
const { syncFromTransaction } = require('./installments');
const { statsFor, checkCategorySpike } = require('../services/unusual');
const { bangkokToday } = require('../services/plan/dateUtil');

const UNUSUAL_FLAGS = ['warned', 'corrected'];
// รายจ่ายของเดือนปัจจุบัน: ตรวจว่ายอดทั้งเดือนของหมวดสูงผิดปกติไหม (แจ้งกระดิ่ง) ไม่รอผล ไม่ให้กระทบการบันทึก
const spikeCheck = (userId, t) => {
  if (t.type !== 'expense' || t.date.toISOString().slice(0, 7) !== bangkokToday().slice(0, 7)) return;
  checkCategorySpike(userId, t.category).catch((e) => console.error('[spike]', e.message));
};

const router = express.Router();
router.use(auth);

const toDto = (t) => ({
  transaction_id: t._id,
  type: t.type,
  amount: t.amount,
  note: t.note,
  transaction_date: t.date.toISOString().slice(0, 10),
  category_id: t.category && t.category._id,
  category_name: t.category && t.category.name,
  category_color: t.category && t.category.color,
  category_icon: t.category && t.category.icon,
});

const parseDate = (s) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// หมวดต้องเป็นหมวดมาตรฐาน หรือของผู้ใช้คนนี้เท่านั้น (ถ้าระบุ type หมวดต้องเป็นประเภทเดียวกับรายการ)
const categoryAllowed = async (categoryId, userId, type) => {
  if (!mongoose.isValidObjectId(categoryId)) return false;
  const q = { _id: categoryId, $or: [{ user: null }, { user: userId }] };
  if (type) q.type = type;
  const c = await Category.findOne(q);
  return !!c;
};

// ตัวกรองรายการ (ใช้ร่วมกันระหว่างหน้ารายการและการส่งออก CSV) คืน { q } หรือ { error }
function buildFilter(req) {
  const q = { user: req.userId };
  if (req.query.start || req.query.end) {
    q.date = {};
    if (req.query.start) {
      const d = parseDate(req.query.start);
      if (!d) return { error: 'รูปแบบวันที่เริ่มต้นไม่ถูกต้อง' };
      q.date.$gte = d;
    }
    if (req.query.end) {
      const d = parseDate(req.query.end);
      if (!d) return { error: 'รูปแบบวันที่สิ้นสุดไม่ถูกต้อง' };
      q.date.$lte = d;
    }
  }
  if (['income', 'expense'].includes(req.query.type)) q.type = req.query.type;
  if (req.query.category_id && mongoose.isValidObjectId(req.query.category_id)) {
    q.category = req.query.category_id;
  }
  return { q };
}

// ช่อง CSV: กันสูตรอันตรายตอนเปิดใน Excel (ขึ้นต้นด้วย = + - @ tab) และครอบด้วย "..." เมื่อมี , " หรือขึ้นบรรทัดใหม่
const csvCell = (v) => {
  let s = String(v === undefined || v === null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};
const EXPORT_MAX = 10000;
const TYPE_TH = { income: 'รายรับ', expense: 'รายจ่าย' };

// ดูรายการ (กรอง + แบ่งหน้า)
router.get('/', async (req, res) => {
  try {
    const { q, error } = buildFilter(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [total, rows] = await Promise.all([
      Transaction.countDocuments(q),
      Transaction.find(q)
        .populate('category', 'name color icon')
        .sort({ date: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({ success: true, data: rows.map(toDto), pagination: { page, limit, total } });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ส่งออก CSV ตามตัวกรองเดียวกับหน้ารายการ (UTF-8 + BOM ให้ Excel อ่านภาษาไทยถูก) ต้องอยู่ก่อน /:id
router.get('/export', async (req, res) => {
  try {
    const { q, error } = buildFilter(req);
    if (error) return res.status(400).json({ success: false, message: error });
    const total = await Transaction.countDocuments(q);
    if (total > EXPORT_MAX) {
      return res.status(400).json({ success: false, message: `มี ${total.toLocaleString('en-US')} รายการ เกิน ${EXPORT_MAX.toLocaleString('en-US')} รายการต่อไฟล์ กรุณากรองช่วงวันที่ให้แคบลง` });
    }
    const rows = await Transaction.find(q).populate('category', 'name').sort({ date: -1, _id: -1 }).lean();
    const lines = [['วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวนเงิน', 'บันทึกช่วยจำ'].map(csvCell).join(',')];
    for (const t of rows) {
      lines.push([
        t.date.toISOString().slice(0, 10),
        TYPE_TH[t.type] || t.type,
        (t.category && t.category.name) || '',
        Number(t.amount).toFixed(2),
        t.note || '',
      ].map(csvCell).join(','));
    }
    const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // วันที่ตามเวลาไทย
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${day}.csv"; filename*=UTF-8''${encodeURIComponent(`รายรับรายจ่าย_${day}.csv`)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ค่าปกติต่อรายการของแต่ละหมวด (ใช้เตือนตอนบันทึกยอดที่สูงผิดปกติ) { [category_id]: { median, threshold, n } }
router.get('/typical', async (req, res) => {
  try {
    const stats = await statsFor(req.userId, bangkokToday());
    const data = {};
    for (const [k, v] of Object.entries(stats)) data[k] = { median: v.median, threshold: v.threshold, n: v.n };
    res.json({ success: true, data });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// เพิ่มรายการ
router.post('/', async (req, res) => {
  try {
    const { type, category_id, transaction_date } = req.body;
    const amt = parseAmount(req.body.amount);
    const noteCheck = cleanNote(req.body.note);
    const date = transaction_date ? parseDate(transaction_date) : null;
    const amount = amt.value;

    if (!['income', 'expense'].includes(type) || !category_id || !date || !yearInRange(date)) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง' });
    }
    if (amt.error) return res.status(400).json({ success: false, message: amt.error });
    if (noteCheck.error) return res.status(400).json({ success: false, message: noteCheck.error });
    if (!(await categoryAllowed(category_id, req.userId, type))) {
      return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้องหรือไม่ตรงกับประเภทรายการ' });
    }

    const t = await Transaction.create({
      user: req.userId,
      category: category_id,
      type,
      amount,
      note: noteCheck.value,
      date,
      unusual: type === 'expense' && UNUSUAL_FLAGS.includes(req.body.unusual) ? req.body.unusual : null,
    });

    // ขั้นที่ 5 จะเพิ่มการตรวจงบประมาณตรงนี้
    if (type === 'expense') await checkBudgetAlert(req.userId, category_id, date);
    spikeCheck(req.userId, t);

    res.status(201).json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      data: { transaction_id: t._id },
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ตรวจ id ก่อนเข้า route ด้านล่าง
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'รหัสรายการไม่ถูกต้อง' });
  }
  next();
});

// ดูรายการเดียว
router.get('/:id', async (req, res) => {
  try {
    const t = await Transaction.findOne({ _id: req.params.id, user: req.userId })
      .populate('category', 'name color icon');
    if (!t) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    res.json({ success: true, data: toDto(t) });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// แก้ไขรายการ
router.put('/:id', async (req, res) => {
  try {
    const t = await Transaction.findOne({ _id: req.params.id, user: req.userId });
    if (!t) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });

    const before = { category: t.category, date: t.date }; // งบเดิมของรายการนี้ (เผื่อย้ายหมวด/เปลี่ยนวันที่)

    const b = req.body;
    let changed = false;

    if ('type' in b) {
      if (!['income', 'expense'].includes(b.type)) {
        return res.status(400).json({ success: false, message: 'ประเภทไม่ถูกต้อง' });
      }
      // ประเภท (รายรับ/รายจ่าย) เปลี่ยนไม่ได้หลังบันทึก ส่งประเภทเดิมมาได้ (หน้าเว็บส่งทั้งฟอร์ม)
      if (b.type !== t.type) {
        return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนประเภทรายการได้ กรุณาลบแล้วเพิ่มใหม่' });
      }
    }
    if ('amount' in b) {
      const amt = parseAmount(b.amount);
      if (amt.error) return res.status(400).json({ success: false, message: amt.error });
      t.amount = amt.value; changed = true;
    }
    if ('category_id' in b) {
      // ส่งหมวดเดิมมาไม่ต้องตรวจซ้ำ (หน้าเว็บส่งทั้งฟอร์ม) แต่ถ้าเปลี่ยนหมวดต้องเป็นหมวดประเภทเดียวกับรายการ
      if (String(b.category_id) !== String(t.category)) {
        if (!(await categoryAllowed(b.category_id, req.userId, t.type))) {
          return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้องหรือไม่ตรงกับประเภทรายการ' });
        }
        t.category = b.category_id; changed = true;
      }
    }
    if ('note' in b) {
      const noteCheck = cleanNote(b.note);
      if (noteCheck.error) return res.status(400).json({ success: false, message: noteCheck.error });
      t.note = noteCheck.value; changed = true;
    }
    if ('transaction_date' in b) {
      const d = parseDate(b.transaction_date);
      if (!d || !yearInRange(d)) return res.status(400).json({ success: false, message: 'วันที่ไม่ถูกต้อง' });
      t.date = d; changed = true;
    }

    if (!changed) {
      return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลให้แก้ไข' });
    }
    if (t.type === 'expense' && UNUSUAL_FLAGS.includes(b.unusual)) t.unusual = b.unusual;
    await t.save();
    if (t.installment) await syncFromTransaction(t); // รายจ่ายจากงวดผ่อน: แก้ยอด → ยอดที่จ่ายของงวดนั้นเปลี่ยนตาม
    if (t.type === 'expense') {
      await checkBudgetAlert(req.userId, t.category, t.date);
      // ย้ายหมวดหรือเปลี่ยนวันที่: ยอดใช้ของงบเดิมลดลง ปรับระดับแจ้งเตือนของงบเดิมด้วย (รีเซ็ตเงียบ ๆ)
      if (String(before.category) !== String(t.category) || before.date.getTime() !== t.date.getTime()) {
        await checkBudgetAlert(req.userId, before.category, before.date);
      }
      spikeCheck(req.userId, t);
    }
    
    res.json({ success: true, message: 'แก้ไขรายการสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ลบรายการ
router.delete('/:id', async (req, res) => {
  try {
    const t = await Transaction.findOne({ _id: req.params.id, user: req.userId });
    if (!t) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    }
    await Transaction.deleteOne({ _id: t._id, user: req.userId });
    if (t.installment) await syncFromTransaction(t, { deleted: true }); // ลบรายจ่ายของงวดผ่อน → งวดนั้นกลับเป็นยังไม่จ่าย
    // ลบรายจ่ายแล้วยอดใช้ของงบลดลง: ปรับระดับแจ้งเตือนของงบนั้น (รีเซ็ตเงียบ ๆ ไม่ส่งแจ้งเตือน)
    if (t.type === 'expense') await checkBudgetAlert(req.userId, t.category, t.date);
    res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;