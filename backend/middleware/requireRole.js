// ใช้หลัง auth: อนุญาตเฉพาะบทบาทที่ระบุ เช่น requireRole('admin', 'owner')
module.exports = (...roles) => (req, res, next) => {
  if (roles.includes(req.userRole)) return next();
  return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' });
};
