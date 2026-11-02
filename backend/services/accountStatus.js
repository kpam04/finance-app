// ข้อความและรูปแบบการตอบเมื่อบัญชีถูกระงับ (ใช้ทั้งตอนล็อกอินและตอนใช้ token เดิม)
// ตอบรหัส 403 ไม่ใช่ 401 เพราะ 401 ทำให้หน้าเว็บออกจากระบบเงียบ ๆ โดยผู้ใช้ไม่เห็นเหตุผล
function suspendedPayload(user) {
  const contact = process.env.CONTACT_EMAIL || '';
  const reason = user.suspendedReason || '';
  let message = 'บัญชีของคุณถูกระงับ';
  if (reason) message += ` เหตุผล: ${reason}`;
  if (contact) message += ` หากต้องการสอบถาม ติดต่อ ${contact}`;
  return { success: false, code: 'ACCOUNT_SUSPENDED', message, reason, contact_email: contact };
}

module.exports = { suspendedPayload };
