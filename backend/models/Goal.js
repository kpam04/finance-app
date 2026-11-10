const mongoose = require('mongoose');

// เป้าหมายการออมของผู้ใช้ (กำลังออมได้สูงสุด MAX_GOALS เป้า / เป้าที่สำเร็จแล้วเก็บเป็นประวัติ ไม่นับรวม)
const schema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:          { type: String, required: true, maxlength: 60 },
  target_amount: { type: Number, required: true, min: 0.01 },
  saved_amount:  { type: Number, default: 0, min: 0 },
  target_date:   { type: Date, required: true },
  completed_at:  { type: Date, default: null }, // วันที่ออมครบ (null = กำลังออม) ระบบใส่ให้อัตโนมัติเมื่อยอดออมแล้วถึงเป้า
}, { timestamps: true });

schema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model('Goal', schema);
