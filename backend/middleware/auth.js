const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { suspendedPayload } = require('../services/accountStatus');

const ACTIVE_UPDATE_MS = 60 * 60 * 1000; // อัปเดต "ใช้งานล่าสุด" อย่างมากชั่วโมงละครั้ง

const sessionInvalid = (res, message) =>
  res.status(401).json({ success: false, code: 'SESSION_INVALID', message });

// ตรวจ token และสถานะบัญชีจากฐานข้อมูลทุกคำขอ (บัญชียังอยู่ ไม่ถูกระงับ เวอร์ชัน token ตรง)
// สิทธิ์ (role) อ่านจากฐานข้อมูล ไม่ฝังใน token ลดสิทธิ์แล้วมีผลทันที
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, code: 'NO_TOKEN', message: 'กรุณาเข้าสู่ระบบ' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return sessionInvalid(res, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  try {
    const user = await User.findById(payload.userId)
      .select('email firstName lastName fullName role status tokenVersion suspendedReason lastActiveAt')
      .lean();
    if (!user) return sessionInvalid(res, 'ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่');

    if (user.status === 'suspended') return res.status(403).json(suspendedPayload(user));
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return sessionInvalid(res, 'เซสชันนี้ถูกยกเลิก กรุณาเข้าสู่ระบบใหม่');
    }

    const now = Date.now();
    if (!user.lastActiveAt || now - new Date(user.lastActiveAt).getTime() >= ACTIVE_UPDATE_MS) {
      try {
        await User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date(now) } });
      } catch (e) {
        /* ไม่ให้การบันทึกเวลาใช้งานทำให้คำขอล้มเหลว */
      }
    }

    req.userId = String(user._id);
    req.userRole = user.role || 'user';
    req.authUser = user;
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
};
