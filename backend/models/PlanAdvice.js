const mongoose = require('mongoose');

// คำแนะนำจาก AI ล่าสุดของแต่ละเดือน (เก็บเพื่อไม่ต้องเรียก AI ซ้ำ ผู้ใช้ลบได้ ลบบัญชีแล้วลบด้วย)
// facts_used เก็บ "ตัวเลขที่ใช้" ณ ตอนสร้าง เพื่อให้ป้ายตัวเลขตรงกับข้อความเสมอ
const item = new mongoose.Schema({
  tag:        { type: String, enum: ['warning', 'goal', 'tip'], default: 'tip' },
  text:       { type: String, required: true },
  facts_used: { type: [mongoose.Schema.Types.Mixed], default: [] },
  rating:     { type: Number, enum: [-1, 0, 1], default: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month:        { type: String, required: true }, // YYYY-MM
  items:        { type: [item], default: [] },
  model:        { type: String, default: '' },
  event:        { type: mongoose.Schema.Types.ObjectId, ref: 'AiEvent', default: null },
  // ลายนิ้วมือของข้อมูล ณ ตอนที่ AI เขียน (ใช้เตือนเมื่อข้อมูลเปลี่ยนไปภายหลัง) ไม่ใช่ข้อมูลส่วนตัว (เป็นค่าแฮช)
  data_sig:     { type: String, default: '' },
  goals_sig:    { type: String, default: '' },
  generated_at: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('PlanAdvice', schema);
