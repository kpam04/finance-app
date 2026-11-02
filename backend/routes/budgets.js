const express = require('express');
const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { parseAmount } = require('../utils/inputRules');
const { syncBudget, ensureCurrentMonthBudgets } = require('../services/budgetAlert');
const { forecastFor } = require('../services/budgetForecast');
const { thaiPeriod } = require('../services/budgetCarry');

const router = express.Router();
router.use(auth);

const round1 = (n) => Math.round(n * 10) / 10;
const currentThaiPeriod = () => thaiPeriod();

// ดูงบประมาณของเดือน + ยอดที่ใช้ไปแล้ว (งบที่ "หยุดใช้" จะไม่แสดง งบที่ปิดไว้เดือนนี้แสดงเป็นสถานะ off)
router.get('/', async (req, res) => {
  try {
    const def = currentThaiPeriod();
    let month = parseInt(req.query.month, 10);
    let year = parseInt(req.query.year, 10);
    if (!(month >= 1 && month <= 12)) month = def.month;
    if (!(year >= 2000 && year <= 2100)) year = def.year;

    // เปิดดูเดือนปัจจุบัน: สร้างงบเดือนนี้จากเดือนก่อนให้อัตโนมัติ (ไม่สร้างให้เดือนอดีต/อนาคต)
    if (month === def.month && year === def.year) {
      try {
        await ensureCurrentMonthBudgets(req.userId);
      } catch (e) {
        console.error('ensureCurrentMonthBudgets error:', e.message);
      }
    }

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const [budgets, spentRows] = await Promise.all([
      Budget.find({ user: req.userId, month, year, stopped: { $ne: true } }),
      Transaction.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(req.userId), type: 'expense', date: { $gte: start, $lt: end } } },
        { $group: { _id: '$category', spent: { $sum: '$amount' } } },
      ]),
    ]);
    const spentMap = new Map(spentRows.map((r) => [String(r._id), r.spent]));

    const catIds = [...new Set(budgets.map((b) => String(b.category)))];
    const cats = catIds.length ? await Category.find({ _id: { $in: catIds } }).lean() : [];
    const catMap = new Map(cats.map((c) => [String(c._id), c]));

    const data = [];
    for (const b of budgets) {
      const cat = catMap.get(String(b.category));
      if (!cat) continue;
      const spent = spentMap.get(String(b.category)) || 0;
      const percent = b.amountLimit > 0 ? round1((spent / b.amountLimit) * 100) : 0;
      const enabled = b.enabled !== false;
      const forecast = enabled ? await forecastFor(b) : null;
      data.push({
        budget_id: b._id,
        amount_limit: b.amountLimit,
        alert_threshold: b.alertThreshold,
        period_month: b.month,
        period_year: b.year,
        category_id: cat._id,
        category_name: cat.name,
        color: cat.color,
        spent,
        percent_used: percent,
        enabled,
        repeat: b.repeat !== false,
        status: !enabled ? 'off' : percent >= 100 ? 'over' : percent >= b.alertThreshold ? 'warning' : 'ok',
        forecast: forecast
          ? { projected: forecast.projected, over: forecast.over, will_exceed: forecast.will_exceed, reach_day: forecast.reach_day }
          : null,
      });
    }

    res.json({ success: true, data });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ตั้งงบประมาณ (ตั้งซ้ำหมวด/เดือนเดิม = อัปเดตทับ) repeat = ใช้ต่อเนื่องทุกเดือน (ค่าเริ่มต้นเปิด)
router.post('/', async (req, res) => {
  try {
    const def = currentThaiPeriod();
    const limitCheck = parseAmount(req.body.amount_limit, 'วงเงินงบประมาณ');
    if (limitCheck.error) return res.status(400).json({ success: false, message: limitCheck.error });
    const limit = limitCheck.value;
    const month = parseInt(req.body.period_month, 10) || def.month;
    const year = parseInt(req.body.period_year, 10) || def.year;
    const threshold = req.body.alert_threshold === undefined ? 80 : Number(req.body.alert_threshold);
    const categoryId = req.body.category_id;

    if (!mongoose.isValidObjectId(categoryId) || !(limit > 0)) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }
    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return res.status(400).json({ success: false, message: 'เดือนหรือปีไม่ถูกต้อง' });
    }
    if (!(threshold >= 1 && threshold <= 100)) {
      return res.status(400).json({ success: false, message: 'เกณฑ์แจ้งเตือนต้องอยู่ระหว่าง 1-100' });
    }
    if (req.body.repeat !== undefined && typeof req.body.repeat !== 'boolean') {
      return res.status(400).json({ success: false, message: 'ค่า "ใช้ต่อเนื่องทุกเดือน" ไม่ถูกต้อง' });
    }

    const cat = await Category.findOne({ _id: categoryId, $or: [{ user: null }, { user: req.userId }] });
    if (!cat) return res.status(400).json({ success: false, message: 'หมวดหมู่ไม่ถูกต้อง' });
    if (cat.type !== 'expense') {
      return res.status(400).json({ success: false, message: 'ตั้งงบประมาณได้เฉพาะหมวดรายจ่าย' });
    }

    const key = { user: req.userId, category: categoryId, month, year };
    // ตั้งงบใหม่ทับงบที่เคย "หยุดใช้" = เริ่มใช้ใหม่ (เปิดใช้ ต่อเนื่อง ล้างระดับแจ้งเตือน)
    await Budget.updateOne({ ...key, stopped: true }, {
      $set: { stopped: false, enabled: true, repeat: true, alertLevel: 0, forecastNotified: false },
    });

    const set = { amountLimit: limit, alertThreshold: threshold };
    if (typeof req.body.repeat === 'boolean') set.repeat = req.body.repeat;
    const budget = await Budget.findOneAndUpdate(
      key,
      { $set: set },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // ตั้ง/แก้งบแล้วคำนวณระดับแจ้งเตือนตามยอดที่ใช้ไปแล้ว: ถ้าถึงเกณฑ์อยู่แล้วแจ้งทันที 1 ครั้ง
    // ขยายวงเงินจนยอดต่ำกว่าระดับเดิม = รีเซ็ตเงียบ ๆ (ความล้มเหลวของการแจ้งเตือนต้องไม่ทำให้การตั้งงบล้มเหลว)
    try {
      await syncBudget(budget, { notify: true });
    } catch (e) {
      console.error('syncBudget error:', e.message);
    }

    res.status(201).json({ success: true, message: 'ตั้งงบประมาณสำเร็จ', data: { budget_id: budget._id } });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// เปิด/ปิดงบเดือนนี้ (enabled) และตั้งว่าจะยกไปเดือนถัดไปหรือไม่ (repeat)
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'รหัสงบประมาณไม่ถูกต้อง' });
    }
    const b = req.body || {};
    const set = {};
    for (const field of ['enabled', 'repeat']) {
      if (field in b) {
        if (typeof b[field] !== 'boolean') {
          return res.status(400).json({ success: false, message: 'ค่าที่ส่งมาไม่ถูกต้อง' });
        }
        set[field] = b[field];
      }
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลให้แก้ไข' });
    }

    const budget = await Budget.findOne({ _id: req.params.id, user: req.userId, stopped: { $ne: true } });
    if (!budget) return res.status(404).json({ success: false, message: 'ไม่พบงบประมาณ' });

    await Budget.updateOne({ _id: budget._id }, { $set: set });
    const after = await Budget.findById(budget._id);
    try {
      // ปิดงบ: รีเซ็ตระดับเงียบ ๆ / เปิดงบ: คำนวณระดับตามยอดปัจจุบัน (ถ้าถึงเกณฑ์แล้วแจ้ง 1 ครั้ง)
      await syncBudget(after, { notify: true });
    } catch (e) {
      console.error('syncBudget error:', e.message);
    }
    res.json({ success: true, message: 'บันทึกการเปลี่ยนแปลงสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// หยุดใช้งบนี้ (ปุ่ม "ลบ"/"หยุดใช้งบนี้"): ซ่อนจากรายการ ไม่ยกไปเดือนถัดไป ลบการแจ้งเตือนของงบนี้
// เก็บเป็นเอกสารที่ถูกหยุดไว้ เพื่อไม่ให้ระบบสร้างงบนี้กลับมาเองจากเดือนก่อน (เดือนอดีตไม่เปลี่ยน ตั้งใหม่ได้ภายหลัง)
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'รหัสงบประมาณไม่ถูกต้อง' });
    }
    const r = await Budget.updateOne(
      { _id: req.params.id, user: req.userId, stopped: { $ne: true } },
      { $set: { stopped: true, enabled: false, repeat: false, alertLevel: 0 } }
    );
    if (r.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบงบประมาณ' });
    }
    await Notification.deleteMany({ user: req.userId, budget: req.params.id });
    res.json({ success: true, message: 'ลบงบประมาณสำเร็จ' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;
