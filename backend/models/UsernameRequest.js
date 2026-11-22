const mongoose = require('mongoose');

// คำขอเปลี่ยนชื่อผู้ใช้ (ชื่อผู้ใช้ล็อกหลังตั้ง เปลี่ยนได้เมื่อแอดมินอนุมัติเท่านั้น)
//  ผู้ใช้ระบุชื่อใหม่ + เหตุผล -> แอดมินอนุมัติ (เปลี่ยนให้ทันที) หรือปฏิเสธ (ระบุเหตุผลได้)
//  มีคำขอรอพิจารณาได้ทีละ 1 เรื่อง / ถูกปฏิเสธแล้วยื่นใหม่ได้หลัง 7 วัน
const schema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromUsername:  { type: String, required: true },
  toUsername:    { type: String, required: true },
  reason:        { type: String, required: true, maxlength: 300 },
  status:        { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  decidedBy:     { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt:     { type: Date, default: null },
  decisionNote:  { type: String, default: '', maxlength: 100 }, // เหตุผลที่ปฏิเสธ (ถ้ามี)
}, { timestamps: true });

schema.index({ user: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });
// กันคำขอรอพิจารณาซ้อนของผู้ใช้คนเดียว
schema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_user' });

module.exports = mongoose.model('UsernameRequest', schema);
module.exports.REAPPLY_DAYS = 7;
