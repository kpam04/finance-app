const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:       { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  amountLimit:    { type: Number, required: true, min: 0.01 },
  month:          { type: Number, required: true, min: 1, max: 12 },
  year:           { type: Number, required: true },
  alertThreshold: { type: Number, default: 80 },
  alertLevel:     { type: Number, default: 0, min: 0, max: 2 }, // ระดับแจ้งเตือนที่แจ้งไปแล้ว: 0 ยังไม่แจ้ง, 1 ถึงเกณฑ์, 2 ถึง/เกิน 100%
  enabled:        { type: Boolean, default: true },   // ใช้งบนี้ในเดือนนี้ (ปิดไว้ได้ ไม่คำนวณ/ไม่แจ้งเตือน เดือนหน้ากลับมาเปิดเอง)
  repeat:         { type: Boolean, default: true },   // ยกงบนี้ไปเดือนถัดไปอัตโนมัติ
  stopped:        { type: Boolean, default: false },  // หยุดใช้งบนี้ (ซ่อนจากรายการ และไม่ยกต่อ ตั้งใหม่ได้ภายหลัง)
  forecastNotified: { type: Boolean, default: false }, // แจ้งเตือนเชิงพยากรณ์ในเดือนนี้ไปแล้ว (ครั้งเดียวต่องบต่อเดือน)
  payStyle:       { type: String, enum: ['auto', 'lump', 'spread'], default: 'auto' }, // วิธีจ่าย: auto = ระบบเดาจากประวัติ / lump = จ่ายเป็นก้อน / spread = ทยอยจ่าย (ใช้กับไฟสถานะ)
}, { timestamps: true });

schema.index({ user: 1, category: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Budget', schema);