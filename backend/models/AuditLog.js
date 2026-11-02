const mongoose = require('mongoose');

// บันทึกการกระทำของผู้ดูแลระบบ (ไม่เก็บข้อมูลการเงิน เก็บอีเมลแบบปิดบางส่วนเท่านั้น) ลบอัตโนมัติเมื่อครบ 1 ปี
const ACTIONS = [
  'suspend', 'unsuspend', 'force_logout', 'delete_user',
  'promote_admin', 'demote_admin', 'owner_created',
];

const schema = new mongoose.Schema({
  actor:            { type: mongoose.Schema.Types.ObjectId, default: null }, // null = สคริปต์ในเครื่อง
  actorRole:        { type: String, default: '' },
  actorEmailMasked: { type: String, default: '' },
  action:           { type: String, enum: ACTIONS, required: true },
  target:           { type: mongoose.Schema.Types.ObjectId, default: null },
  targetEmailMasked:{ type: String, default: '' },
  reason:           { type: String, default: '' },
  createdAt:        { type: Date, default: Date.now },
});

schema.index({ createdAt: -1 });
// ลบเองเมื่อครบ 1 ปี (MongoDB ตรวจและลบเป็นระยะ จึงอาจช้ากว่าเวลาจริงเล็กน้อย)
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365, name: 'auditlog_ttl_1y' });

module.exports = mongoose.model('AuditLog', schema);
module.exports.ACTIONS = ACTIONS;
