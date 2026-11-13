const mongoose = require('mongoose');

const NOTIFICATION_TTL_DAYS = 90; // เก็บการแจ้งเตือน 90 วัน แล้วฐานข้อมูลลบให้เอง

const schema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  budget:  { type: mongoose.Schema.Types.ObjectId, ref: 'Budget' },
  kind:    { type: String, enum: ['level', 'forecast', 'installment', 'recurring', 'spike'], default: 'level' }, // level = ถึงเกณฑ์/ถึงวงเงิน, forecast = คาดการณ์ว่าจะเกินงบ, installment = บิลผ่อนใกล้ครบกำหนด, recurring = พบรายจ่ายที่น่าจะเป็นรายการประจำ, spike = ยอดทั้งเดือนของหมวดสูงผิดปกติ
  key:     { type: String, default: null }, // กันแจ้งเตือนซ้ำ (เช่น บิลผ่อน: inst:<ช่องทาง>|<วันครบกำหนด>:<soon|due>)
  level:   { type: Number, enum: [1, 2] },           // 1 ใกล้ถึงวงเงิน, 2 ถึง/เกินวงเงิน (ข้อมูลเก่าและแบบคาดการณ์ไม่มีค่านี้)
  message: { type: String, required: true },
  isRead:  { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ user: 1, createdAt: -1 });
schema.index({ user: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });
schema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_DAYS * 24 * 3600 });

module.exports = mongoose.model('Notification', schema);
module.exports.NOTIFICATION_TTL_DAYS = NOTIFICATION_TTL_DAYS;
