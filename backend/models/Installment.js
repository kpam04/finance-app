const mongoose = require('mongoose');

// แผนผ่อนชำระ (SPayLater / บัตรเครดิต / ร้านค้า ฯลฯ) หนึ่งเอกสาร = สินค้าหนึ่งชิ้น
// schedule = ตารางงวด: amount = ยอดตามตาราง / paid = จ่ายแล้ว / paid_amount = ยอดที่จ่ายจริง
// prepaid = งวดที่จ่ายไปก่อนเริ่มใช้แอป (ไม่มีรายการรายจ่ายในแอป) / transaction = รายการรายจ่ายที่ระบบสร้างตอนกด "จ่ายแล้ว"
// ยอดของงวดที่ยังไม่จ่ายคำนวณใหม่ทุกครั้ง: ส่วนต่างของงวดที่จ่ายจริงไม่ตรงตาราง ไปปรับที่งวดท้าย ๆ (services/installments.js)
const itemSchema = new mongoose.Schema({
  n:           { type: Number, required: true },
  amount:      { type: Number, required: true, min: 0 },
  paid:        { type: Boolean, default: false },
  paid_amount: { type: Number, default: null },
  paid_at:     { type: Date, default: null },
  prepaid:     { type: Boolean, default: false },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:          { type: String, required: true, maxlength: 60 },
  channel:       { type: String, enum: ['spaylater', 'lazpaylater', 'tiktok', 'credit_card', 'store', 'other'], required: true },
  channel_name:  { type: String, default: '', maxlength: 40 }, // เช่น ชื่อบัตร "KBank" / ชื่อร้าน (ไม่บังคับ)
  category:      { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  price:         { type: Number, required: true, min: 0.01 },
  down_payment:  { type: Number, default: 0, min: 0 },
  months:        { type: Number, required: true, min: 1 },
  due_day:       { type: Number, required: true, min: 1, max: 31 },
  first_month:   { type: String, required: true }, // งวดแรก 'YYYY-MM'
  total_payable: { type: Number, default: null },  // ยอดรวมที่ผู้ให้ผ่อนแจ้ง (ไม่บังคับ)
  equal:         { type: Boolean, default: true }, // true = ทุกงวดยอดเท่ากัน (เศษไปงวดสุดท้าย)
  schedule:      { type: [itemSchema], default: [] },
  status:        { type: String, enum: ['active', 'done'], default: 'active' },
  closed_at:     { type: Date, default: null },
}, { timestamps: true });

schema.index({ user: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('Installment', schema);
