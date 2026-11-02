const AuditLog = require('../models/AuditLog');

// อีเมลแบบปิดบางส่วน: somsri@gmail.com -> so***@gmail.com
function maskEmail(email) {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? '***' : '';
  const local = s.slice(0, at);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***${s.slice(at)}`;
}

/**
 * บันทึกการกระทำของ admin
 * เรียก "ก่อน" ทำการจริง ถ้าบันทึกไม่ได้จะโยน error เพื่อไม่ให้การกระทำเกิดขึ้นโดยไม่มีหลักฐาน
 * actor/target เป็นเอกสารผู้ใช้ (หรือ null สำหรับสคริปต์ในเครื่อง)
 */
async function recordAudit({ actor = null, action, target = null, reason = '' }) {
  await AuditLog.create({
    actor: actor ? actor._id : null,
    actorRole: actor ? actor.role || '' : 'script',
    actorEmailMasked: actor ? maskEmail(actor.email) : '',
    action,
    target: target ? target._id : null,
    targetEmailMasked: target ? maskEmail(target.email) : '',
    reason: String(reason || '').slice(0, 100),
  });
}

module.exports = { maskEmail, recordAudit };
