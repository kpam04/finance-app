const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Recurring = require('../models/Recurring');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const AiUsage = require('../models/AiUsage');
const AiEvent = require('../models/AiEvent');
const Goal = require('../models/Goal');
const PlanAdvice = require('../models/PlanAdvice');
const RecurringDismiss = require('../models/RecurringDismiss');
const Installment = require('../models/Installment');

// ลบข้อมูลทั้งหมดของผู้ใช้ แล้วลบบัญชีเป็นขั้นสุดท้าย (ถ้าขัดข้องกลางทาง สั่งซ้ำได้)
// ใช้ร่วมกันระหว่าง "ผู้ใช้ลบบัญชีตัวเอง" และ "admin ลบบัญชี" ส่วนที่เพิ่มในอนาคต (เช่น เรื่องร้องเรียน) ให้เพิ่มที่นี่ที่เดียว
async function deleteUserData(userId) {
  await Notification.deleteMany({ user: userId });
  await Transaction.deleteMany({ user: userId });
  await Recurring.deleteMany({ user: userId });
  await Budget.deleteMany({ user: userId });
  await Category.deleteMany({ user: userId }); // เฉพาะหมวดของผู้ใช้เอง (หมวดมาตรฐานมี user = null)
  await AiUsage.deleteMany({ user: userId });
  await AiEvent.deleteMany({ user: userId });
  await Goal.deleteMany({ user: userId });
  await PlanAdvice.deleteMany({ user: userId });
  await RecurringDismiss.deleteMany({ user: userId });
  await Installment.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
}

module.exports = { deleteUserData };
