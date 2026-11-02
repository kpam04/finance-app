// สร้างหรือเลื่อนบัญชีให้เป็น "เจ้าของระบบ" (owner) รันได้เฉพาะในเครื่องที่มีไฟล์ .env เท่านั้น
// วิธีใช้ (ในโฟลเดอร์ backend):  node scripts/makeOwner.js
//  - ถ้ายังไม่มีบัญชีอีเมลนั้น จะสร้างใหม่ (ข้ามข้อจำกัดโดเมนตอนสมัคร ใช้อีเมล .ac.th ได้)
//  - ถ้ามีบัญชีอยู่แล้ว จะเลื่อนสิทธิ์เป็นเจ้าของ
//  - มีเจ้าของได้คนเดียว ถ้ามีอยู่แล้วสคริปต์จะปฏิเสธ
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const readline = require('node:readline');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const v = require('../utils/userValidation');
const { recordAudit, maskEmail } = require('../services/audit');

const POLICY_VERSION = '1.1';

// ถาม-ตอบทางหน้าจอ รองรับทั้งพิมพ์เองและส่งข้อความผ่านท่อ (pipe) ช่องรหัสผ่านไม่แสดงตัวอักษรที่พิมพ์
function makePrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : queue.push(l)));
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  rl.muted = false;
  rl._writeToOutput = function (s) {
    if (!rl.muted) rl.output.write(s);
  };
  const next = () =>
    queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => waiters.push(r));
  return {
    async ask(q) {
      process.stdout.write(q);
      const a = await next();
      return a === null ? null : a.trim();
    },
    async askHidden(q) {
      process.stdout.write(q);
      rl.muted = true;
      const a = await next();
      rl.muted = false;
      process.stdout.write('\n');
      return a;
    },
    close: () => rl.close(),
  };
}

async function run(p) {
  const existingOwner = await User.findOne({ role: 'owner' }).lean();
  if (existingOwner) {
    console.error(`มีเจ้าของระบบอยู่แล้ว (${maskEmail(existingOwner.email)}) ไม่สามารถสร้างซ้ำได้`);
    return 1;
  }

  const emailIn = await p.ask('อีเมลของเจ้าของระบบ: ');
  if (emailIn === null) return 1;
  const email = v.checkEmail(emailIn); // ตรวจเฉพาะรูปแบบ ไม่บังคับโดเมนที่สมัครได้
  if (email.error) {
    console.error(email.error);
    return 1;
  }

  const existing = await User.findOne({ email: email.value });
  if (existing) {
    if (existing.status === 'suspended') {
      console.error('บัญชีนี้ถูกระงับอยู่ ไม่สามารถเลื่อนเป็นเจ้าของได้');
      return 1;
    }
    console.log(`พบบัญชีนี้แล้ว: ${existing.fullName || existing.email}`);
    const ok = await p.ask('เลื่อนบัญชีนี้เป็นเจ้าของระบบ? (พิมพ์ yes เพื่อยืนยัน): ');
    if (ok !== 'yes') {
      console.log('ยกเลิก ไม่มีการเปลี่ยนแปลง');
      return 1;
    }
    await recordAudit({ actor: null, action: 'owner_created', target: existing, reason: 'เลื่อนบัญชีเดิมด้วยสคริปต์' });
    await User.updateOne({ _id: existing._id }, { $set: { role: 'owner' }, $inc: { tokenVersion: 1 } });
    console.log('เลื่อนสิทธิ์สำเร็จ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่อให้เมนู "ผู้ดูแลระบบ" ปรากฏ');
    return 0;
  }

  // สร้างบัญชีใหม่
  const firstIn = await p.ask('ชื่อ: ');
  const lastIn = await p.ask('นามสกุล: ');
  if (firstIn === null || lastIn === null) return 1;
  const first = v.checkName(firstIn, 'ชื่อ');
  if (first.error) {
    console.error(first.error);
    return 1;
  }
  const last = v.checkName(lastIn, 'นามสกุล');
  if (last.error) {
    console.error(last.error);
    return 1;
  }

  const pw1 = await p.askHidden('รหัสผ่าน (อย่างน้อย 8 ตัวอักษร): ');
  const pw2 = await p.askHidden('ยืนยันรหัสผ่าน: ');
  if (pw1 === null || pw2 === null) return 1;
  const pw = v.checkPassword(pw1);
  if (pw.error) {
    console.error(pw.error);
    return 1;
  }
  if (pw1 !== pw2) {
    console.error('รหัสผ่านและการยืนยันไม่ตรงกัน');
    return 1;
  }

  const user = await User.create({
    firstName: first.value,
    lastName: last.value,
    email: email.value,
    passwordHash: await bcrypt.hash(pw.value, 10),
    role: 'owner',
    policyAcceptedAt: new Date(),
    policyVersion: POLICY_VERSION,
  });
  await recordAudit({ actor: null, action: 'owner_created', target: user, reason: 'สร้างบัญชีด้วยสคริปต์' });
  console.log(`สร้างบัญชีเจ้าของระบบสำเร็จ: ${maskEmail(user.email)}`);
  console.log('เข้าสู่ระบบด้วยอีเมลและรหัสผ่านนี้ แล้วเมนู "ผู้ดูแลระบบ" จะปรากฏ');
  return 0;
}

(async () => {
  const p = makePrompter();
  let code = 1;
  try {
    await mongoose.connect(process.env.MONGO_URI);
    code = await run(p);
  } catch (e) {
    console.error(e);
  } finally {
    p.close();
    await mongoose.disconnect();
  }
  process.exitCode = code;
})();
