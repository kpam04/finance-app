const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // saving / withdraw = ออมเข้าเป้าหมาย / ถอนออกจากเป้าหมาย (ไม่ใช่รายรับ-รายจ่าย ไม่มีหมวด) สร้างได้จากหน้าเป้าหมายเท่านั้น
  category:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: function () { return this.type === 'income' || this.type === 'expense'; }, default: null },
  type:      { type: String, enum: ['income', 'expense', 'saving', 'withdraw'], required: true },
  amount:    { type: Number, required: true, min: 0.01 },
  note:      { type: String, default: '' },
  date:      { type: Date, required: true },
  recurring: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurring', default: null },
  installment:   { type: mongoose.Schema.Types.ObjectId, ref: 'Installment', default: null }, // รายจ่ายที่มาจากการกด "จ่ายแล้ว" ของงวดผ่อน
  installment_n: { type: Number, default: null },
  goal:      { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null }, // เฉพาะ saving / withdraw (เปลี่ยนเป้าไม่ได้)
  goal_name: { type: String, default: '' },                                        // ชื่อเป้า ณ ตอนบันทึก (ยังแสดงได้หลังลบเป้า)
  reason:    { type: String, default: '', maxlength: 100 },                         // เหตุผลที่ถอน (ไม่บังคับ แก้ไม่ได้)
  // ตรวจยอดผิดปกติตอนบันทึก (เก็บไว้ทำสถิติ): warned = บันทึกตอนมีคำเตือน / corrected = เคยขึ้นคำเตือนแล้วผู้ใช้แก้ยอดจนหาย
  unusual: { type: String, enum: ['warned', 'corrected'], default: null },
}, { timestamps: true });

schema.index({ user: 1, date: -1 });
schema.index({ user: 1, type: 1 });
schema.index({ user: 1, goal: 1 });

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

// ประเภทที่เป็นรายรับ-รายจ่ายจริง (ใช้กรองในทุกการคำนวณรายรับ/รายจ่าย/งบ/การวิเคราะห์)
const CASH_TYPES = ['income', 'expense'];
const SAVING_TYPES = ['saving', 'withdraw'];

module.exports = mongoose.model('Transaction', schema);
module.exports.CASH_TYPES = CASH_TYPES;
module.exports.SAVING_TYPES = SAVING_TYPES;
