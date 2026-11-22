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
const UsernameRequest = require('../models/UsernameRequest');

const router = express.Router();
// Express 5 ไม่ใส่ {} ให้ req.body เมื่อไม่มีข้อมูลส่งมา กันโค้ดด้านล่างพังเมื่อเรียกโดยไม่มี body
router.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// เวอร์ชันของประกาศความเป็นส่วนตัว (เปลี่ยนเมื่อแก้เนื้อหานโยบาย) 1.1 = เพิ่มข้อความเรื่องผู้ดูแลระบบ
const { POLICY_VERSION, policyAccepted } = require('../utils/policy');

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
    username: u.username || null,
    currency: u.currency,
    phone: u.phone || '',
    birth_date: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
    occupation: u.occupation || '',
    monthly_income: u.monthlyIncome === undefined ? null : u.monthlyIncome,
    avatar: u.avatar || null, // รูปโปรไฟล์ (data URL) หรือ null ถ้ายังไม่มี ผู้ดูแลระบบไม่ได้รับฟิลด์นี้ (หน้าผู้ดูแลเลือกเฉพาะฟิลด์พื้นฐาน)
    policy_accepted_at: u.policyAcceptedAt || null,
    policy_version: u.policyVersion || '',
    policy_current: POLICY_VERSION,
    policy_ok: policyAccepted(u), // false = ต้องกดยอมรับนโยบายเวอร์ชันใหม่ก่อนใช้งานต่อ
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
    const uname = v.checkUsername(req.body.username);
    if (uname.error) return fail(res, 400, uname.error);
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
    if (await User.findOne({ username: uname.value })) {
      return fail(res, 409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    }

    // ไม่รับ role/status จาก body เด็ดขาด ผู้ใช้ใหม่เป็น user เสมอ (ค่าเริ่มต้นใน schema)
    const passwordHash = await bcrypt.hash(pw.value, 10);
    const user = await User.create({
      firstName: first.value,
      lastName: last.value,
      email: email.value,
      username: uname.value,
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
    if (e.code === 11000) return fail(res, 409, e.keyPattern && e.keyPattern.username ? 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' : 'อีเมลนี้ถูกใช้งานแล้ว');
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ: ' + e.message);
  }
});

// ---------- ตรวจว่าชื่อผู้ใช้ว่างไหม (ใช้ขณะพิมพ์ในหน้าสมัคร/โปรไฟล์) ----------
router.get('/username-available', async (req, res) => {
  try {
    const r = v.checkUsername(req.query.u);
    if (r.error) return res.json({ success: true, data: { available: false, error: r.error } });
    const taken = await User.exists({ username: r.value });
    res.json({ success: true, data: { available: !taken, username: r.value, error: taken ? 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' : null } });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ---------- เข้าสู่ระบบ ----------
router.post('/login', async (req, res) => {
  try {
    // เข้าได้ 2 แบบ (แท็บในหน้าเข้าสู่ระบบ): mode = 'username' | 'email'
    //  ไม่ส่ง mode (หน้าเว็บเก่า/หลังสมัคร) = ดูจาก @ เอง / ข้อผิดพลาดบอกช่องที่ผิด (field) ให้หน้าเว็บแสดงใต้ช่องนั้น
    const id = v.cleanText(req.body.identifier !== undefined ? req.body.identifier : req.body.username !== undefined ? req.body.username : req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const mode = req.body.mode === 'email' || req.body.mode === 'username' ? req.body.mode : id.includes('@') ? 'email' : 'username';
    const label = mode === 'email' ? 'อีเมล' : 'ชื่อผู้ใช้';
    const fieldErr = (status, code, field, message, extra = {}) => res.status(status).json({ success: false, code, field, message, ...extra });
    if (!id) return fieldErr(400, 'REQUIRED', 'identifier', `กรุณากรอก${label}`);
    if (!password) return fieldErr(400, 'REQUIRED', 'password', 'กรุณากรอกรหัสผ่าน');
    const fmt = mode === 'email' ? v.checkEmail(id) : v.checkUsername(id);
    if (fmt.error) return fieldErr(400, 'INVALID_FORMAT', 'identifier', mode === 'email' ? 'รูปแบบอีเมลไม่ถูกต้อง' : fmt.error);

    // จำกัดล็อกอินผิดซ้ำ (ชื่อผู้ใช้/อีเมล + IP เดียวกัน) นับทั้งกรณีไม่พบบัญชีและรหัสผ่านผิด
    const key = `${mode}:${fmt.value}|${req.ip}`;
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

    const user = await User.findOne(mode === 'email' ? { email: fmt.value } : { username: fmt.value });
    if (!user) {
      const f = loginLimiter.fail(key);
      if (f.blocked) return blockedReply(f.retryAfterSec);
      return fieldErr(401, 'ACCOUNT_NOT_FOUND', 'identifier', mode === 'email' ? 'ไม่พบบัญชีที่ใช้อีเมลนี้' : 'ไม่พบบัญชีที่ใช้ชื่อผู้ใช้นี้', { remaining: f.remaining });
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const f = loginLimiter.fail(key);
      if (f.blocked) return blockedReply(f.retryAfterSec);
      // บอกจำนวนครั้งที่เหลือเมื่อเหลือไม่เกิน 2 ครั้ง (ก่อนถูกล็อก 15 นาที)
      const left = f.remaining <= 2 ? ` (ลองได้อีก ${f.remaining} ครั้ง)` : '';
      return fieldErr(401, 'WRONG_PASSWORD', 'password', `รหัสผ่านไม่ถูกต้อง${left}`, { remaining: f.remaining });
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

    // ชื่อผู้ใช้: ตั้งเองได้ครั้งแรกครั้งเดียว (ผู้ใช้เดิมที่ยังไม่มี) ตั้งแล้วล็อก เปลี่ยนต้องยื่นคำขอให้แอดมินอนุมัติ
    if ('username' in b && b.username !== null && String(b.username).trim()) {
      const r = v.checkUsername(b.username);
      if (r.error) return fail(res, 400, r.error);
      if (user.username) {
        if (r.value !== user.username) return fail(res, 403, 'ชื่อผู้ใช้เปลี่ยนเองไม่ได้ กรุณายื่นคำขอเปลี่ยนชื่อผู้ใช้');
      } else {
        if (await User.exists({ username: r.value, _id: { $ne: user._id } })) return fail(res, 409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
        user.username = r.value;
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

    try {
      await user.save();
    } catch (e) {
      if (e.code === 11000) return fail(res, 409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
      throw e;
    }
    const body = { success: true, message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว', data: publicUser(user) };
    if (passwordChanged) body.token = makeToken(user);
    res.json(body);
  } catch (e) {
    fail(res, 500, e.message);
  }
});

// ---------- ยอมรับนโยบายเวอร์ชันใหม่ (ผู้ใช้เดิมที่ยอมรับเวอร์ชันเก่าไว้) ----------
router.post('/accept-policy', auth, async (req, res) => {
  try {
    if (req.body.version !== POLICY_VERSION) return fail(res, 400, 'กรุณาอ่านนโยบายเวอร์ชันล่าสุดแล้วกดยอมรับอีกครั้ง');
    await User.updateOne({ _id: req.userId }, { $set: { policyAcceptedAt: new Date(), policyVersion: POLICY_VERSION } });
    const user = await User.findById(req.userId);
    res.json({ success: true, message: 'ยอมรับนโยบายแล้ว', data: publicUser(user) });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ---------- คำขอเปลี่ยนชื่อผู้ใช้ (แอดมินอนุมัติ) ----------
const DAY_MS = 24 * 3600 * 1000;
const requestOut = (r) => r && ({
  request_id: r._id,
  from_username: r.fromUsername,
  to_username: r.toUsername,
  reason: r.reason,
  status: r.status,
  decision_note: r.decisionNote || '',
  created_at: r.createdAt,
  decided_at: r.decidedAt || null,
});
// สถานะสำหรับหน้าโปรไฟล์: คำขอล่าสุด + ยื่นใหม่ได้เมื่อไหร่
async function requestState(userId) {
  const last = await UsernameRequest.findOne({ user: userId }).sort({ createdAt: -1 }).lean();
  let canRequestAt = null;
  if (last && last.status === 'rejected' && last.decidedAt) {
    const t = new Date(new Date(last.decidedAt).getTime() + UsernameRequest.REAPPLY_DAYS * DAY_MS);
    if (t > new Date()) canRequestAt = t;
  }
  return { request: requestOut(last), can_request: !(last && last.status === 'pending') && !canRequestAt, can_request_at: canRequestAt };
}

router.get('/username-request', auth, async (req, res) => {
  try {
    res.json({ success: true, data: await requestState(req.userId) });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

router.post('/username-request', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('username').lean();
    if (!user) return fail(res, 404, 'ไม่พบข้อมูลผู้ใช้');
    if (!user.username) return fail(res, 400, 'ยังไม่ได้ตั้งชื่อผู้ใช้ ตั้งเองได้ในหน้าแก้ไขโปรไฟล์');
    const st = await requestState(req.userId);
    if (st.request && st.request.status === 'pending') return fail(res, 409, 'มีคำขอที่รอแอดมินพิจารณาอยู่แล้ว');
    if (st.can_request_at) return fail(res, 429, `คำขอก่อนหน้าถูกปฏิเสธ ยื่นใหม่ได้ตั้งแต่ ${new Date(st.can_request_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })}`);
    const r = v.checkUsername(req.body.username);
    if (r.error) return fail(res, 400, r.error);
    if (r.value === user.username) return fail(res, 400, 'ชื่อใหม่ต้องไม่ซ้ำกับชื่อผู้ใช้ปัจจุบัน');
    if (await User.exists({ username: r.value })) return fail(res, 409, 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว');
    const reason = v.cleanText(req.body.reason);
    const n = Array.from(reason).length;
    if (n < 10) return fail(res, 400, 'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร');
    if (n > 300) return fail(res, 400, 'เหตุผลต้องไม่เกิน 300 ตัวอักษร');
    try {
      await UsernameRequest.create({ user: req.userId, fromUsername: user.username, toUsername: r.value, reason });
    } catch (e) {
      if (e.code === 11000) return fail(res, 409, 'มีคำขอที่รอแอดมินพิจารณาอยู่แล้ว');
      throw e;
    }
    res.status(201).json({ success: true, message: 'ส่งคำขอแล้ว รอแอดมินพิจารณา', data: await requestState(req.userId) });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
  }
});

// ยกเลิกคำขอที่ยังรอพิจารณา
router.delete('/username-request', auth, async (req, res) => {
  try {
    const r = await UsernameRequest.findOneAndUpdate({ user: req.userId, status: 'pending' }, { $set: { status: 'cancelled', decidedAt: new Date() } });
    if (!r) return fail(res, 404, 'ไม่มีคำขอที่รอพิจารณา');
    res.json({ success: true, message: 'ยกเลิกคำขอแล้ว', data: await requestState(req.userId) });
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ');
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
