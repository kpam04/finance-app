const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Recurring = require('../models/Recurring');
const auth = require('../middleware/auth');
const v = require('../utils/userValidation');
const loginLimiter = require('../services/loginLimiter');
const { suspendedPayload } = require('../services/accountStatus');
const { deleteUserData } = require('../services/accountDeletion');

const router = express.Router();
// Express 5 ไม่ใส่ {} ให้ req.body เมื่อไม่มีข้อมูลส่งมา กันโค้ดด้านล่างพังเมื่อเรียกโดยไม่มี body
router.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// เวอร์ชันของประกาศความเป็นส่วนตัว (เปลี่ยนเมื่อแก้เนื้อหานโยบาย) 1.1 = เพิ่มข้อความเรื่องผู้ดูแลระบบ
const POLICY_VERSION = '1.2'; // 1.2 = เพิ่มข้อความเรื่องการส่งข้อมูลไปบริการ AI ภายนอก (ผู้ใช้เปิดเอง) และรูปโปรไฟล์

// อายุ token เป็นชั่วโมง ปรับได้ใน .env (ผู้ใช้ทั่วไป 7 วัน, admin/เจ้าของ 4 ชั่วโมง)
const hoursFor = (role) => {
  const raw = role === 'admin' || role === 'owner' ? process.env.TOKEN_HOURS_ADMIN : process.env.TOKEN_HOURS_USER;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : role === 'admin' || role === 'owner' ? 4 : 168;
};

// tv = เลขเวอร์ชัน token ถ้าไม่ตรงกับในฐานข้อมูล token นี้ใช้ไม่ได้ (เปลี่ยนรหัสผ่าน/ระงับ/บังคับออก)
const makeToken = (user) =>
  jwt.sign({ userId: String(user._id), tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: Math.round(hoursFor(user.role) * 3600),
  });

// รูปแบบ user ที่ส่งกลับ (ใช้ชื่อ field แบบ snake_case เหมือนเดิม + ฟิลด์โปรไฟล์ + บทบาท)
// ถ้าเป็นผู้ใช้เก่าที่ยังไม่ได้ย้ายข้อมูล จะแยกชื่อจาก fullName ให้อัตโนมัติ
function publicUser(u) {
  const legacy = v.splitFullName(u.fullName);
  const firstName = u.firstName || legacy.firstName;
  const lastName = u.firstName ? u.lastName || '' : legacy.lastName;
  return {
    user_id: u._id,
    first_name: firstName,
    last_name: lastName,
    full_name: [firstName, lastName].filter(Boolean).join(' '),
    nickname: u.nickname || '',
    display_name: u.nickname || firstName,
    email: u.email,
    currency: u.currency,
    phone: u.phone || '',
    birth_date: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
    occupation: u.occupation || '',
    monthly_income: u.monthlyIncome === undefined ? null : u.monthlyIncome,
    avatar: u.avatar || null, // รูปโปรไฟล์ (data URL) หรือ null ถ้ายังไม่มี ผู้ดูแลระบบไม่ได้รับฟิลด์นี้ (หน้าผู้ดูแลเลือกเฉพาะฟิลด์พื้นฐาน)
    policy_accepted_at: u.policyAcceptedAt || null,
    policy_version: u.policyVersion || '',
    role: u.role || 'user',
    status: u.status || 'active',
    created_at: u.createdAt,
  };
}

// อ่านชื่อ/นามสกุลจาก body (รองรับ full_name แบบเก่าชั่วคราว เพื่อให้หน้าเว็บเดิมยังใช้ได้)
function readNames(body) {
  if (body.first_name !== undefined || body.last_name !== undefined) {
    return { first: body.first_name, last: body.last_name };
  }
  if (body.full_name !== undefined) {
    const s = v.splitFullName(body.full_name);
    return { first: s.firstName, last: s.lastName };
  }
  return null;
}

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// ---------- สมัครสมาชิก ----------
router.post('/register', async (req, res) => {
  try {
    const names = readNames(req.body) || { first: '', last: '' };
    const first = v.checkName(names.first, 'ชื่อ');
    if (first.error) return fail(res, 400, first.error);
    const last = v.checkName(names.last, 'นามสกุล');
    if (last.error) return fail(res, 400, last.error);
    const email = v.checkSignupEmail(req.body.email);
    if (email.error) return fail(res, 400, email.error);
    const pw = v.checkPassword(req.body.password);
    if (pw.error) return fail(res, 400, pw.error);
    if (req.body.confirm_password !== undefined && req.body.confirm_password !== req.body.password) {
      return fail(res, 400, 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
    }
    const accepted = [true, 'true', 1, '1'].includes(req.body.accept_policy);
    if (!accepted) return fail(res, 400, 'กรุณายอมรับนโยบายความเป็นส่วนตัว');
    if (await User.findOne({ email: email.value })) {
      return fail(res, 409, 'อีเมลนี้ถูกใช้งานแล้ว');
    }

    // ไม่รับ role/status จาก body เด็ดขาด ผู้ใช้ใหม่เป็น user เสมอ (ค่าเริ่มต้นใน schema)
    const passwordHash = await bcrypt.hash(pw.value, 10);
    const user = await User.create({
      firstName: first.value,
      lastName: last.value,
      email: email.value,
      passwordHash,
      policyAcceptedAt: new Date(),
      policyVersion: POLICY_VERSION,
      lastActiveAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      data: { token: makeToken(user), user: publicUser(user) },
    });
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, 'อีเมลนี้ถูกใช้งานแล้ว');
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ: ' + e.message);
  }
});

// ---------- เข้าสู่ระบบ ----------
router.post('/login', async (req, res) => {
  try {
    const email = v.cleanText(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return fail(res, 400, 'กรุณากรอกอีเมลและรหัสผ่าน');

    // จำกัดล็อกอินผิดซ้ำ (อีเมล + IP เดียวกัน)
    const key = `${email}|${req.ip}`;
    const state = loginLimiter.check(key);
    const blockedReply = (sec) => {
      const minutes = Math.max(1, Math.ceil(sec / 60));
      res.set('Retry-After', String(sec));
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: `ล็อกอินผิดหลายครั้ง กรุณารอประมาณ ${minutes} นาทีแล้วลองใหม่`,
        retry_after_seconds: sec,
      });
    };
    if (state.blocked) return blockedReply(state.retryAfterSec);

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      const f = loginLimiter.fail(key);
      if (f.blocked) return blockedReply(f.retryAfterSec);
      return fail(res, 401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    loginLimiter.reset(key);

    // บัญชีถูกระงับ: บอกเหตุผลเฉพาะเมื่อรหัสผ่านถูกต้อง
    if (user.status === 'suspended') return res.status(403).json(suspendedPayload(user));

    await User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } });

    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      data: { token: makeToken(user), user: publicUser(user) },
    });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ: ' + e.message);
  }
});

// ---------- ดูโปรไฟล์ + สถิติ ----------
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 404, 'ไม่พบข้อมูลผู้ใช้');

    const [tx, bgt, rec] = await Promise.all([
      Transaction.countDocuments({ user: req.userId }),
      Budget.countDocuments({ user: req.userId }),
      Recurring.countDocuments({ user: req.userId }),
    ]);

    res.json({
      success: true,
      data: {
        user: publicUser(user),
        stats: { total_transactions: tx, total_budgets: bgt, total_recurring: rec },
      },
    });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ---------- แก้ไขโปรไฟล์ / เปลี่ยนรหัสผ่าน ----------
// ส่งเฉพาะ field ที่ต้องการแก้ ช่องไม่บังคับส่งค่าว่างเพื่อล้างค่าได้ อีเมลและบทบาทเปลี่ยนไม่ได้
// เปลี่ยนรหัสผ่านแล้ว token เดิมทุกเครื่องใช้ไม่ได้ และตอบ token ใหม่กลับมาให้เครื่องที่เปลี่ยน (ฟิลด์ token)
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 404, 'ไม่พบข้อมูลผู้ใช้');
    const b = req.body;

    // ชื่อ-นามสกุล (ผู้ใช้เก่าที่ยังไม่ได้ย้ายข้อมูล ใช้ค่าที่แยกจาก fullName)
    const current = publicUser(user);
    const given = readNames(b);
    const first = v.checkName(given ? given.first : current.first_name, 'ชื่อ');
    if (first.error) return fail(res, 400, first.error);
    const last = v.checkName(given ? given.last : current.last_name, 'นามสกุล');
    if (last.error) return fail(res, 400, last.error);
    user.firstName = first.value;
    user.lastName = last.value;

    // ข้อมูลเพิ่มเติม (ไม่บังคับ)
    const optional = [
      ['nickname', 'nickname', v.checkNickname],
      ['phone', 'phone', v.checkPhone],
      ['birth_date', 'birthDate', (x) => v.checkBirthDate(x)],
      ['occupation', 'occupation', v.checkOccupation],
      ['monthly_income', 'monthlyIncome', v.checkIncome],
      ['currency', 'currency', v.checkCurrency],
    ];
    for (const [key, field, check] of optional) {
      if (key in b) {
        const r = check(b[key]);
        if (r.error) return fail(res, 400, r.error);
        user[field] = r.value;
      }
    }

    // รูปโปรไฟล์ (ส่ง avatar เป็น data URL เพื่อเปลี่ยน ส่ง null หรือ '' เพื่อลบ ไม่ส่งมา = ไม่เปลี่ยน)
    if ('avatar' in b) {
      const r = v.checkAvatar(b.avatar);
      if (r.error) return fail(res, 400, r.error);
      user.avatar = r.value === null ? undefined : r.value;
    }

    // เปลี่ยนรหัสผ่าน (ถ้าส่งมา)
    let passwordChanged = false;
    if (b.current_password || b.new_password) {
      if (!(await bcrypt.compare(b.current_password || '', user.passwordHash))) {
        return fail(res, 400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
      }
      const pw = v.checkPassword(b.new_password, 'รหัสผ่านใหม่');
      if (pw.error) return fail(res, 400, pw.error);
      if (b.confirm_new_password !== undefined && b.confirm_new_password !== b.new_password) {
        return fail(res, 400, 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      }
      user.passwordHash = await bcrypt.hash(pw.value, 10);
      user.tokenVersion = (user.tokenVersion || 0) + 1; // บังคับออกจากระบบทุกเครื่อง
      passwordChanged = true;
    }

    await user.save();
    const body = { success: true, message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว', data: publicUser(user) };
    if (passwordChanged) body.token = makeToken(user);
    res.json(body);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ---------- ลบบัญชี (ต้องยืนยันด้วยรหัสผ่าน) ----------
// รหัสผ่านผิดตอบ 400 (ไม่ใช่ 401) เพราะหน้าเว็บจะออกจากระบบเองเมื่อได้ 401
// บัญชี admin/เจ้าของลบเองไม่ได้ (กันระบบไม่มีผู้ดูแล) ต้องให้เจ้าของลดสิทธิ์ก่อน ส่วนเจ้าของต้องจัดการทางฐานข้อมูล
router.delete('/account', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 404, 'ไม่พบข้อมูลผู้ใช้');
    if (user.role === 'admin' || user.role === 'owner') {
      return fail(res, 403, 'บัญชีผู้ดูแลระบบลบเองไม่ได้ ต้องให้เจ้าของลดสิทธิ์ก่อน');
    }

    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      return fail(res, 400, 'รหัสผ่านไม่ถูกต้อง');
    }

    await deleteUserData(user._id);
    res.json({ success: true, message: 'ลบบัญชีและข้อมูลทั้งหมดเรียบร้อยแล้ว' });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

module.exports = router;
module.exports.POLICY_VERSION = POLICY_VERSION;
