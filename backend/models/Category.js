const mongoose = require('mongoose');

module.exports = mongoose.model('Category', new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name:      { type: String, required: true },
  type:      { type: String, enum: ['income', 'expense'], required: true },
  icon:      { type: String, default: 'tag' },
  color:     { type: String, default: '#6366f1' },
  isDefault: { type: Boolean, default: false },
  // ลำดับการแสดงของหมวดมาตรฐาน (น้อยไปมาก) หมวดที่ผู้ใช้สร้างเองไม่ตั้งค่านี้ จึงเรียงตามชื่อ
  sortOrder: { type: Number },
  // ซ่อนหมวด (เฉพาะหมวดที่ผู้ใช้สร้างเองและเคยมีข้อมูลใช้อยู่): ไม่แสดงในตัวเลือก แต่ประวัติเดิมยังแสดงชื่อหมวดนี้ กดแสดงอีกครั้งได้
  hidden: { type: Boolean, default: false },
}));