const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const JobRun = require('../models/JobRun');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { recordAudit } = require('../services/audit');
const { deleteUserData } = require('../services/accountDeletion');
const v = require('../utils/userValidation');

const router = express.Router();
router.use(auth, requireRole('admin', 'owner'));
// Express 5 ไม่ใส่ {} ให้ req.body เมื่อไม่มีข้อมูลส่งมา กันโค้ดด้านล่างพังเมื่อเรียกโดยไม่มี body
router.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

const MAX_ADMINS = 5; // รวมเจ้าของ
const PAGE_SIZE = 20;
const TH_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageOf = (q) => Math.max(1, parseInt(q.page, 10) || 1);

// เหตุผลของการกระทำ: ไม่เกิน 100 ตัวอักษร (required = บังคับกรอก)
function cleanReason(value, required) {
  const s = v.cleanText(value);
  if (!s) return required ? { error: 'กรุณาระบุเหตุผล (ไม่เกิน 100 ตัวอักษร)' } : { value: '' };
  if (Array.from(s).length > 100) return { error: 'เหตุผลต้องไม่เกิน 100 ตัวอักษร' };
  return { value: s };
}

// ข้อมูลผู้ใช้ที่ admin เห็นได้ (เฉพาะข้อมูลบัญชีพื้นฐาน ไม่มีข้อมูลการเงินหรือโปรไฟล์อื่น)
const userRow = (u) => ({
  user_id: u._id,
  first_name: u.firstName || '',
  last_name: u.lastName || '',
  full_name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' '),
  email: u.email,
  created_at: u.createdAt,
  last_active_at: u.lastActiveAt || null,
  status: u.status || 'active',
  role: u.role || 'user',
  suspended_reason: u.suspendedReason || '',
});
const USER_FIELDS = 'firstName lastName fullName email createdAt lastActiveAt status role suspendedReason';

async function loadTarget(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    fail(res, 400, 'รหัสผู้ใช้ไม่ถูกต้อง');
    return null;
  }
  const target = await User.findById(req.params.id).lean();
  if (!target) {
    fail(res, 404, 'ไม่พบบัญชีผู้ใช้');
    return null;
  }
  return target;
}

// กฎป้องกันของการกระทำต่อบัญชีผู้ใช้: ไม่ทำกับตัวเอง และไม่ทำกับ admin/เจ้าของโดยตรง (ต้องให้เจ้าของลดสิทธิ์ก่อน)
function blocked(req, res, target) {
  if (String(target._id) === req.userId) {
    fail(res, 400, 'ไม่สามารถดำเนินการกับบัญชีของตัวเองในหน้านี้ได้');
    return true;
  }
  if ((target.role || 'user') !== 'user') {
    fail(res, 400, 'บัญชีผู้ดูแลระบบต้องให้เจ้าของลดสิทธิ์ก่อนจึงจะดำเนินการนี้ได้');
    return true;
  }
  return false;
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    fail(res, 500, 'เกิดข้อผิดพลาดของระบบ: ' + e.message);
  }
};

// ---------- ภาพรวม ----------
router.get('/overview', wrap(async (req, res) => {
  const now = Date.now();
  const thDay = (d) => new Date(d.getTime() + TH_OFFSET_MS).toISOString().slice(0, 10);

  // 30 วันล่าสุด นับตามวันเวลาไทย
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(thDay(new Date(now - i * DAY_MS)));
  const since = new Date(`${days[0]}T00:00:00.000+07:00`);
  const recent = await User.find({ createdAt: { $gte: since } }).select('createdAt').lean();
  const counts = Object.fromEntries(days.map((d) => [d, 0]));
  recent.forEach((u) => {
    const d = thDay(new Date(u.createdAt));
    if (d in counts) counts[d] += 1;
  });

  const [total, active7] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ lastActiveAt: { $gte: new Date(now - 7 * DAY_MS) } }),
  ]);

  res.json({
    success: true,
    data: {
      total_users: total,
      active_7d: active7,
      new_30d: days.reduce((s, d) => s + counts[d], 0),
      signups_daily: days.map((d) => ({ date: d, count: counts[d] })),
    },
  });
}));

// ---------- รายชื่อผู้ใช้ ----------
router.get('/users', wrap(async (req, res) => {
  const page = pageOf(req.query);
  const q = {};
  const search = v.cleanText(req.query.search || '').slice(0, 100);
  if (search) {
    const rx = escapeRegex(search);
    q.$or = [{ fullName: { $regex: rx, $options: 'i' } }, { email: { $regex: rx, $options: 'i' } }];
  }
  if (['active', 'suspended'].includes(req.query.status)) q.status = req.query.status;
  if (['user', 'admin', 'owner'].includes(req.query.role)) q.role = req.query.role;

  const [total, rows] = await Promise.all([
    User.countDocuments(q),
    User.find(q).select(USER_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
  ]);
  res.json({ success: true, data: rows.map(userRow), pagination: { page, limit: PAGE_SIZE, total } });
}));

// ---------- ระงับ / เปิดใช้ / บังคับออกจากระบบ / ลบบัญชี ----------
router.post('/users/:id/suspend', wrap(async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target || blocked(req, res, target)) return;
  const reason = cleanReason(req.body.reason, true);
  if (reason.error) return fail(res, 400, reason.error);
  if (target.status === 'suspended') return fail(res, 400, 'บัญชีนี้ถูกระงับอยู่แล้ว');

  await recordAudit({ actor: req.authUser, action: 'suspend', target, reason: reason.value });
  await User.updateOne(
    { _id: target._id },
    { $set: { status: 'suspended', suspendedReason: reason.value, suspendedAt: new Date() }, $inc: { tokenVersion: 1 } }
  );
  res.json({ success: true, message: 'ระงับบัญชีเรียบร้อยแล้ว' });
}));

router.post('/users/:id/unsuspend', wrap(async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target || blocked(req, res, target)) return;
  const reason = cleanReason(req.body.reason, false);
  if (reason.error) return fail(res, 400, reason.error);
  if (target.status !== 'suspended') return fail(res, 400, 'บัญชีนี้ไม่ได้ถูกระงับ');

  await recordAudit({ actor: req.authUser, action: 'unsuspend', target, reason: reason.value });
  await User.updateOne({ _id: target._id }, { $set: { status: 'active', suspendedReason: '', suspendedAt: null } });
  res.json({ success: true, message: 'เปิดใช้งานบัญชีเรียบร้อยแล้ว' });
}));

router.post('/users/:id/force-logout', wrap(async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target || blocked(req, res, target)) return;
  const reason = cleanReason(req.body.reason, false);
  if (reason.error) return fail(res, 400, reason.error);

  await recordAudit({ actor: req.authUser, action: 'force_logout', target, reason: reason.value });
  await User.updateOne({ _id: target._id }, { $inc: { tokenVersion: 1 } });
  res.json({ success: true, message: 'บังคับออกจากระบบเรียบร้อยแล้ว ผู้ใช้ต้องล็อกอินใหม่' });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target || blocked(req, res, target)) return;
  const reason = cleanReason(req.body && req.body.reason, true);
  if (reason.error) return fail(res, 400, reason.error);
  const confirm = v.cleanText(req.body && req.body.confirm_email).toLowerCase();
  if (!confirm || confirm !== String(target.email).toLowerCase()) {
    return fail(res, 400, 'อีเมลที่พิมพ์ยืนยันไม่ตรงกับบัญชีนี้');
  }

  await recordAudit({ actor: req.authUser, action: 'delete_user', target, reason: reason.value });
  await deleteUserData(target._id);
  res.json({ success: true, message: 'ลบบัญชีและข้อมูลทั้งหมดของผู้ใช้เรียบร้อยแล้ว' });
}));

// ---------- จัดการผู้ดูแล (เจ้าของเท่านั้น) ----------
const ownerOnly = requireRole('owner');

router.get('/admins', ownerOnly, wrap(async (req, res) => {
  const rows = await User.find({ role: { $in: ['admin', 'owner'] } }).select(USER_FIELDS).sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: rows.map(userRow), max_admins: MAX_ADMINS, count: rows.length });
}));

// ยืนยันตัวตนเจ้าของด้วยรหัสผ่านทุกครั้งที่เพิ่ม/ลดสิทธิ์
async function ownerPasswordOk(req, password) {
  const owner = await User.findById(req.userId).select('passwordHash').lean();
  return !!owner && typeof password === 'string' && password.length > 0 && (await bcrypt.compare(password, owner.passwordHash));
}

router.post('/admins', ownerOnly, wrap(async (req, res) => {
  if (!(await ownerPasswordOk(req, req.body.password))) return fail(res, 400, 'รหัสผ่านของเจ้าของไม่ถูกต้อง');
  const reason = cleanReason(req.body.reason, false);
  if (reason.error) return fail(res, 400, reason.error);

  const email = v.cleanText(req.body.email).toLowerCase();
  if (!email) return fail(res, 400, 'กรุณาระบุอีเมลของบัญชีที่จะเพิ่มเป็นผู้ดูแล');
  const count = await User.countDocuments({ role: { $in: ['admin', 'owner'] } });
  if (count >= MAX_ADMINS) return fail(res, 400, `มีผู้ดูแลครบ ${MAX_ADMINS} คนแล้ว (รวมเจ้าของ) ต้องลดสิทธิ์คนใดคนหนึ่งก่อน`);

  const target = await User.findOne({ email }).lean();
  if (!target) return fail(res, 404, 'ไม่พบบัญชีที่ใช้อีเมลนี้ ผู้ที่จะเป็นผู้ดูแลต้องสมัครสมาชิกก่อน');
  if ((target.role || 'user') !== 'user') return fail(res, 400, 'บัญชีนี้เป็นผู้ดูแลอยู่แล้ว');
  if (target.status === 'suspended') return fail(res, 400, 'บัญชีนี้ถูกระงับอยู่ ต้องเปิดใช้งานก่อน');

  await recordAudit({ actor: req.authUser, action: 'promote_admin', target, reason: reason.value });
  // เพิ่ม tokenVersion เพื่อให้ล็อกอินใหม่ และได้ token อายุสั้นของผู้ดูแล
  await User.updateOne({ _id: target._id }, { $set: { role: 'admin' }, $inc: { tokenVersion: 1 } });
  await Notification.create({
    user: target._id,
    message: 'คุณได้รับสิทธิ์ผู้ดูแลระบบ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่อใช้เมนู "ผู้ดูแลระบบ"',
  });
  res.status(201).json({ success: true, message: 'เพิ่มผู้ดูแลระบบเรียบร้อยแล้ว' });
}));

router.delete('/admins/:id', ownerOnly, wrap(async (req, res) => {
  if (!(await ownerPasswordOk(req, req.body && req.body.password))) return fail(res, 400, 'รหัสผ่านของเจ้าของไม่ถูกต้อง');
  const reason = cleanReason(req.body && req.body.reason, true);
  if (reason.error) return fail(res, 400, reason.error);

  const target = await loadTarget(req, res);
  if (!target) return;
  if (String(target._id) === req.userId || target.role === 'owner') return fail(res, 400, 'ไม่สามารถลดสิทธิ์เจ้าของระบบได้');
  if (target.role !== 'admin') return fail(res, 400, 'บัญชีนี้ไม่ใช่ผู้ดูแลระบบ');

  await recordAudit({ actor: req.authUser, action: 'demote_admin', target, reason: reason.value });
  await User.updateOne({ _id: target._id }, { $set: { role: 'user' }, $inc: { tokenVersion: 1 } });
  await Notification.create({ user: target._id, message: 'สิทธิ์ผู้ดูแลระบบของคุณถูกยกเลิกแล้ว' });
  res.json({ success: true, message: 'ลดสิทธิ์ผู้ดูแลระบบเรียบร้อยแล้ว' });
}));

// ---------- บันทึกการกระทำ / สถานะงาน ----------
router.get('/audit', wrap(async (req, res) => {
  const page = pageOf(req.query);
  const [total, rows] = await Promise.all([
    AuditLog.countDocuments({}),
    AuditLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
  ]);
  res.json({
    success: true,
    data: rows.map((r) => ({
      audit_id: r._id,
      action: r.action,
      actor_role: r.actorRole || '',
      actor_email: r.actorEmailMasked || '',
      target_email: r.targetEmailMasked || '',
      reason: r.reason || '',
      created_at: r.createdAt,
    })),
    pagination: { page, limit: PAGE_SIZE, total },
  });
}));

router.get('/jobs', wrap(async (req, res) => {
  const rows = await JobRun.find({ job: 'recurring' }).sort({ startedAt: -1 }).limit(10).lean();
  res.json({
    success: true,
    data: rows.map((r) => ({
      run_id: r._id,
      trigger: r.trigger,
      started_at: r.startedAt,
      finished_at: r.finishedAt,
      rules: r.rules,
      created: r.created,
      errors: r.problems || [],
      ok: r.ok !== false,
    })),
  });
}));

module.exports = router;
