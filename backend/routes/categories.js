const express = require('express');
const Category = require('../models/Category');
const auth = require('../middleware/auth');
const { cleanCategoryName, cleanColor, cleanIcon, MAX_USER_CATEGORIES } = require('../utils/inputRules');

const router = express.Router();
router.use(auth);

const toDto = (c) => ({
  category_id: c._id,
  name: c.name,
  type: c.type,
  icon: c.icon,
  color: c.color,
  is_default: c.isDefault ? 1 : 0,
});

// หมวดมาตรฐาน + หมวดของผู้ใช้เอง
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find({ $or: [{ user: null }, { user: req.userId }] })
      // หมวดมาตรฐานก่อน (รายจ่ายแล้วรายรับ ตามลำดับ sortOrder) ตามด้วยหมวดของผู้ใช้เอง เรียงตามชื่อ
      .sort({ isDefault: -1, type: 1, sortOrder: 1, name: 1 });
    res.json({ success: true, data: cats.map(toDto) });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// สร้างหมวดของตัวเอง
router.post('/', async (req, res) => {
  try {
    const nameCheck = cleanCategoryName(req.body.name);
    const type = req.body.type;
    const color = cleanColor(req.body.color);
    const icon = cleanIcon(req.body.icon);
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }
    for (const c of [nameCheck, color, icon]) {
      if (c.error) return res.status(400).json({ success: false, message: c.error });
    }
    const name = nameCheck.value;

    // ห้ามชื่อซ้ำ (ในประเภทเดียวกัน เทียบกับหมวดมาตรฐานและหมวดของผู้ใช้) และจำกัดจำนวนหมวดที่สร้างเอง
    const visible = await Category.find({ $or: [{ user: null }, { user: req.userId }] }).lean();
    if (visible.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ success: false, message: 'มีหมวดหมู่ชื่อนี้อยู่แล้ว' });
    }
    if (visible.filter((c) => c.user).length >= MAX_USER_CATEGORIES) {
      return res.status(400).json({ success: false, message: `สร้างหมวดหมู่ของตัวเองได้ไม่เกิน ${MAX_USER_CATEGORIES} หมวด` });
    }

    const cat = await Category.create({
      user: req.userId,
      name,
      type,
      icon: icon.value,
      color: color.value,
      isDefault: false,
    });
    res.status(201).json({
      success: true,
      message: 'เพิ่มหมวดหมู่สำเร็จ',
      data: { category_id: cat._id },
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;