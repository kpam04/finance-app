const mongoose = require('mongoose');

// ประวัติรอบงานที่ระบบรันเอง (เช่น สร้างรายการจากกฎรายการซ้ำ) เก็บ 10 รอบล่าสุดต่องาน ไม่มีข้อมูลการเงินของผู้ใช้
const schema = new mongoose.Schema({
  job:        { type: String, required: true },                           // เช่น 'recurring'
  trigger:    { type: String, enum: ['startup', 'daily'], required: true },
  startedAt:  { type: Date, required: true },
  finishedAt: { type: Date, default: Date.now },
  rules:      { type: Number, default: 0 },
  created:    { type: Number, default: 0 },
  problems:   { type: [String], default: [] },   // ข้อความข้อผิดพลาด (ไม่ใช้ชื่อ errors เพราะเป็นชื่อสงวนของ mongoose)
  ok:         { type: Boolean, default: true },
});

schema.index({ job: 1, startedAt: -1 });

module.exports = mongoose.model('JobRun', schema);
