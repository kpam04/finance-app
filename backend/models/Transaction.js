const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  type:      { type: String, enum: ['income', 'expense'], required: true },
  amount:    { type: Number, required: true, min: 0.01 },
  note:      { type: String, default: '' },
  date:      { type: Date, required: true },
  recurring: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurring', default: null },
  installment:   { type: mongoose.Schema.Types.ObjectId, ref: 'Installment', default: null }, // รายจ่ายที่มาจากการกด "จ่ายแล้ว" ของงวดผ่อน
  installment_n: { type: Number, default: null },
  // ตรวจยอดผิดปกติตอนบันทึก (เก็บไว้ทำสถิติ): warned = บันทึกตอนมีคำเตือน / corrected = เคยขึ้นคำเตือนแล้วผู้ใช้แก้ยอดจนหาย
  unusual: { type: String, enum: ['warned', 'corrected'], default: null },
}, { timestamps: true });

schema.index({ user: 1, date: -1 });
schema.index({ user: 1, type: 1 });

// กันสร้างรายการซ้ำจากกฎเดียวกันในวันเดียวกัน (ใช้กับ cron / การรันซ้ำ)
schema.index(
  { recurring: 1, date: 1 },
  { unique: true, partialFilterExpression: { recurring: { $type: 'objectId' } } }
);

// กันบันทึกงวดผ่อนเดียวกันซ้ำ
schema.index(
  { installment: 1, installment_n: 1 },
  { unique: true, partialFilterExpression: { installment: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Transaction', schema);
