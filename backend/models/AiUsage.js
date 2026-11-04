const mongoose = require('mongoose');

// จำนวนครั้งที่ผู้ใช้เรียก AI ต่อวัน (วันตามเวลาไทย) ใช้จำกัดโควต้าแผนฟรี ไม่เก็บเนื้อหาใด ๆ
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true }, // YYYY-MM-DD (เวลาไทย)
  calls: { type: Number, default: 0 }, // จำนวนครั้งที่ส่งข้อความให้ AI
  receipts: { type: Number, default: 0 }, // จำนวนใบเสร็จที่ส่งให้ AI อ่าน (แยกโควต้าจากข้อความ)
}, { timestamps: true });

schema.index({ user: 1, day: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 40 }); // ลบเองหลัง 40 วัน

module.exports = mongoose.model('AiUsage', schema);
