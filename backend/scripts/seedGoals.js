// ข้อมูลตัวอย่าง "เป้าหมายที่ออมสำเร็จแล้ว" สำหรับดูแท็บ "สำเร็จแล้ว" ในหน้าวางแผน
//  รันในโฟลเดอร์ backend:
//    node scripts/seedGoals.js <อีเมล>          สร้างใหม่ (ลบชุดเดิมของสคริปต์นี้ก่อนทุกครั้ง)
//    node scripts/seedGoals.js <อีเมล> --clean  ลบเฉพาะเป้าหมายที่สคริปต์นี้สร้าง
//  - ชื่อเป้าหมายเป็นชื่อปกติ (ไม่มีคำว่า "ทดลอง") จดรหัสไว้ใน scripts/.demo-goals.json (อยู่ในเครื่องเท่านั้น) ใช้ตอน --clean
//  - วันที่คิดย้อนจากวันที่รัน มีทั้งสำเร็จเร็วกว่ากำหนด ตรงกำหนด และช้ากว่ากำหนด
//  - ไม่แตะเป้าหมายอื่นของบัญชี และเป้าที่สำเร็จแล้วไม่นับรวมในโควตาเป้าที่กำลังออม
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dns = require('node:dns');
const mongoose = require('mongoose');
const { dnsServersFor } = require('../utils/runtimeConfig');
const User = require('../models/User');
const Goal = require('../models/Goal');

const IDS_FILE = path.join(__dirname, '.demo-goals.json');
const DAY = 86400000;
const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

function readIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch { return {}; } }
function writeIds(all) { fs.writeFileSync(IDS_FILE, JSON.stringify(all, null, 2)); }

// start = เริ่มออมกี่วันก่อนวันนี้ / done = สำเร็จกี่วันก่อนวันนี้ / due = กำหนดเดิมห่างจากวันสำเร็จกี่วัน (+ เร็วกว่า, − ช้ากว่า)
const GOALS = [
  { name: 'ซื้อโน้ตบุ๊กเครื่องใหม่', amount: 25000, start: 200, done: 6, due: 30 },
  { name: 'ทริปเชียงใหม่', amount: 8000, start: 320, done: 230, due: -13 },
  { name: 'เงินสำรองฉุกเฉิน', amount: 20000, start: 560, done: 300, due: -35 },
  { name: 'ซื้อจักรยาน', amount: 6500, start: 420, done: 360, due: 2 },
  { name: 'ของขวัญวันเกิดแม่', amount: 3500, start: 110, done: 45, due: 9 },
  { name: 'ค่าเทอมภาคเรียนหน้า', amount: 18000, start: 260, done: 75, due: 21 },
];

async function clean(userId) {
  const all = readIds();
  if (!all[userId]) return false;
  await Goal.deleteMany({ _id: { $in: all[userId].goals || [] }, user: userId });
  delete all[userId];
  writeIds(all);
  return true;
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const doClean = process.argv.includes('--clean');
  if (!email || email.startsWith('--')) {
    console.log('วิธีใช้: node scripts/seedGoals.js <อีเมลบัญชีทดสอบ> [--clean]');
    process.exit(1);
  }
  const servers = dnsServersFor(process.env);
  if (servers) dns.setServers(servers);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select('_id').lean();
  if (!user) { console.log('ไม่พบบัญชีอีเมลนี้ (ต้องสมัครสมาชิกไว้ก่อน)'); return; }
  const userId = String(user._id);

  const cleaned = await clean(userId);
  if (doClean) { console.log(cleaned ? 'ลบเป้าหมายตัวอย่างเรียบร้อย' : 'ไม่มีเป้าหมายตัวอย่างของบัญชีนี้'); return; }

  const today = todayTH();
  const ids = [];
  // ใส่ตรงลงคอลเลกชันเพื่อกำหนดวันที่สร้าง (= วันเริ่มออม) และวันสำเร็จได้เอง
  for (const g of GOALS) {
    const completed = addDays(today, -g.done);
    const r = await Goal.collection.insertOne({
      user: new mongoose.Types.ObjectId(userId),
      name: g.name,
      target_amount: g.amount,
      saved_amount: g.amount,
      target_date: addDays(completed, g.due),
      completed_at: completed,
      createdAt: addDays(today, -g.start),
      updatedAt: completed,
      __v: 0,
    });
    ids.push(String(r.insertedId));
  }
  const all = readIds();
  all[userId] = { goals: ids, created_at: new Date().toISOString() };
  writeIds(all);
  const total = GOALS.reduce((s, g) => s + g.amount, 0);
  console.log(`สร้างเป้าหมายที่สำเร็จแล้ว ${ids.length} เป้า รวม ฿${total.toLocaleString('en-US')} (ลบด้วย --clean)`);
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
