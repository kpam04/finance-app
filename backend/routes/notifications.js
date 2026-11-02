const express = require('express');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ดูการแจ้งเตือนล่าสุด 50 รายการ
router.get('/', async (req, res) => {
  try {
    const [rows, unread] = await Promise.all([
      Notification.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ user: req.userId, isRead: false }), // นับจากทั้งหมด ไม่ใช่เฉพาะ 50 รายการล่าสุด
    ]);

    // เดือน/ปีของงบที่เกี่ยวข้อง เพื่อให้หน้าเว็บพาไปหน้างบประมาณของเดือนนั้นได้ (งบถูกลบแล้ว = ไม่มี)
    const budgetIds = [...new Set(rows.filter((n) => n.budget).map((n) => String(n.budget)))];
    const budgets = budgetIds.length ? await Budget.find({ _id: { $in: budgetIds } }).lean() : [];
    const period = new Map(budgets.map((b) => [String(b._id), b]));

    res.json({
      success: true,
      data: rows.map((n) => {
        const b = n.budget ? period.get(String(n.budget)) : null;
        return {
          notification_id: n._id,
          message: n.message,
          is_read: n.isRead ? 1 : 0,
          created_at: n.createdAt,
          kind: n.kind || 'level',
          level: n.level || null,
          budget_id: n.budget || null,
          period_month: b ? b.month : null,
          period_year: b ? b.year : null,
        };
      }),
      unread_count: unread,
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ทำเครื่องหมายอ่านแล้วทั้งหมด
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ user: req.userId, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'อัปเดตสถานะแล้ว' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ทำเครื่องหมายอ่านแล้วทีละรายการ (body: { notification_id })
router.put('/', async (req, res) => {
  try {
    const id = req.body.notification_id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'รหัสการแจ้งเตือนไม่ถูกต้อง' });
    }
    await Notification.updateOne({ _id: id, user: req.userId }, { isRead: true });
    res.json({ success: true, message: 'อัปเดตสถานะแล้ว' });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;