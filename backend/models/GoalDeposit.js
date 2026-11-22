const mongoose = require('mongoose');

// ประวัติการออมเพิ่มของเป้าหมาย (กด "ออมเพิ่ม" ในป๊อปอัปแก้ไขเป้าหมาย)
// การออมไม่ใช่รายจ่าย: ไม่นับในรายจ่าย/งบ/การวิเคราะห์ แต่หักออกจากเงินคงเหลือ (เงินย้ายไปอยู่ในเป้าหมาย)
// ยอดปัจจุบันเก็บที่ Goal.saved_amount (ยอดตั้งต้นตอนสร้าง + ผลรวมรายการนี้) ลบรายการ = ยอดปัจจุบันลดลงตาม
const schema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  goal:   { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  date:   { type: Date, default: null }, // วันที่ออม (เที่ยงคืน UTC ของวันตามเวลาไทย แบบเดียวกับ Transaction.date) ใช้หักออกจากเงินคงเหลือของเดือนนั้น
}, { timestamps: true });

schema.index({ goal: 1, createdAt: -1 });
schema.index({ user: 1, date: 1 });

module.exports = mongoose.model('GoalDeposit', schema);
