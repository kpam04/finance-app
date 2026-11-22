const mongoose = require('mongoose');

// รายจ่ายที่ระบบเคยชวน "ตั้งเป็นรายการประจำ" แล้วผู้ใช้ตอบ "ไม่ใช่" หรือลบรายการประจำนั้นเอง → ไม่ชวนกลุ่มเดิมอีก
//  key = <รหัสหมวด>|<บันทึกช่วยจำแบบตัดช่องว่าง/ตัวพิมพ์/คำว่า "ค่า" นำหน้า>
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key:  { type: String, required: true, maxlength: 200 },
}, { timestamps: true });

schema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('RecurringDismiss', schema);
