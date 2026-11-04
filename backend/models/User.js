const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  firstName:     { type: String, required: true, trim: true },
  lastName:      { type: String, default: '', trim: true },
  fullName:      { type: String, default: '', trim: true }, // สร้างอัตโนมัติจาก ชื่อ + นามสกุล (ใช้เพื่อความเข้ากันได้กับโค้ดเดิม)
  nickname:      { type: String, default: '', trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:  { type: String, required: true },
  currency:      { type: String, default: 'THB' },
  phone:         { type: String, default: '' },
  birthDate:     { type: Date, default: null },
  occupation:    { type: String, default: '' },
  monthlyIncome: { type: Number, default: null, min: 0 }, // เลิกใช้ในหน้าโปรไฟล์แล้ว (ข้อมูลเดิมยังอยู่ ไม่แสดงที่ไหน)
  avatar:        { type: String },                        // รูปโปรไฟล์ (data URL JPG/PNG/WebP ย่อ 256x256 หน้าเว็บส่งมา ไม่เกิน 60KB) ไม่ตั้งค่า = ใช้ตัวอักษรย่อ
  policyAcceptedAt: { type: Date, default: null },   // วันเวลาที่ยอมรับนโยบายความเป็นส่วนตัว
  policyVersion:    { type: String, default: '' },   // เวอร์ชันของนโยบายที่ยอมรับ

  // --- ผู้ช่วย AI (ส่งข้อความไปบริการ AI ภายนอก) ผู้ใช้ต้องเปิดเอง ค่าเริ่มต้นปิด ---
  aiEnabled:        { type: Boolean, default: false },
  aiConsentAt:      { type: Date, default: null },
  aiConsentVersion: { type: String, default: '' },

  // --- ผู้ดูแลระบบ (รอบ A) ---
  role:            { type: String, enum: ['user', 'admin', 'owner'], default: 'user' },
  status:          { type: String, enum: ['active', 'suspended'], default: 'active' },
  suspendedReason: { type: String, default: '' },
  suspendedAt:     { type: Date, default: null },
  lastActiveAt:    { type: Date, default: null },     // อัปเดตอย่างมากชั่วโมงละครั้ง
  tokenVersion:    { type: Number, default: 0 },      // เพิ่มค่าเมื่อต้องการให้ token เดิมใช้ไม่ได้ (เปลี่ยนรหัสผ่าน/ระงับ/บังคับออก)
}, { timestamps: true });

schema.index({ role: 1 });
schema.index({ createdAt: -1 });

// ทุกครั้งก่อนตรวจสอบ/บันทึก ให้สร้าง fullName จากชื่อและนามสกุล
schema.pre('validate', function () {
  this.fullName = [this.firstName, this.lastName].filter(Boolean).join(' ');
});

module.exports = mongoose.model('User', schema);
