// ข้อมูลตัวอย่างสำหรับทดสอบ "ชวนตั้งรายการเกิดซ้ำ" (รายจ่ายที่จดเองทุกเดือน แต่ยังไม่ได้ตั้งเป็นรายการเกิดซ้ำ)
//  รันในโฟลเดอร์ backend:
//    node scripts/seedRecurringSuggest.js <อีเมล>          สร้างใหม่ (ลบชุดเดิมของสคริปต์นี้ก่อนทุกครั้ง)
//    node scripts/seedRecurringSuggest.js <อีเมล> --clean  ลบเฉพาะของที่สคริปต์นี้สร้าง
//  ระบบควรชวน 4 รายการ:
//    Netflix ฿419 ทุกวันที่ 15 (4 เดือน) / Spotify ฿129 ทุกวันที่ 3 (2 เดือน — ชื่อบริการ) /
//    ค่าเน็ตบ้าน ฿599 ทุกวันที่ 5 (3 เดือน เดือนล่าสุด ฿620 ยังอยู่ใน ±10%) / ค่ายิม ฿890 ทุกวันที่ 1 (3 เดือน)
//  ระบบต้องไม่ชวน 3 รายการ:
//    กาแฟ ฿65 (เดือนละหลายครั้ง) / ดูหนัง SF ฿220 (วันไม่แน่นอน) / ค่าโทรศัพท์ ฿399 (เลิกจ่ายไปแล้ว ครั้งล่าสุดเกิน 40 วัน)
//  - วันที่คิดจากวันที่รัน / ชื่อรายการเป็นชื่อปกติ (ไม่มีคำว่า "ทดลอง") จดรหัสไว้ใน scripts/.demo-recsug.json (อยู่ในเครื่องเท่านั้น)
//  - --clean ลบรายการตัวอย่าง + คำตอบ "ไม่ใช่" และการแจ้งเตือนของกลุ่มเหล่านี้ (ทดสอบซ้ำได้)
//    ส่วนรายการเกิดซ้ำที่กดตั้งจากคำชวน ลบเองได้ที่หน้ารายการที่เกิดซ้ำ
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dns = require('node:dns');
const mongoose = require('mongoose');
const { dnsServersFor } = require('../utils/runtimeConfig');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const RecurringDismiss = require('../models/RecurringDismiss');
const { keyOf } = require('../services/recurringSuggest');

const IDS_FILE = path.join(__dirname, '.demo-recsug.json');
const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };

function readIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch { return {}; } }
function writeIds(all) { fs.writeFileSync(IDS_FILE, JSON.stringify(all, null, 2)); }

async function clean(userId) {
  const all = readIds();
  const mine = all[userId];
  if (!mine) return false;
  await Transaction.deleteMany({ _id: { $in: mine.transactions || [] }, user: userId });
  const keys = mine.keys || [];
  await RecurringDismiss.deleteMany({ user: userId, key: { $in: keys } });
  await Notification.deleteMany({ user: userId, key: { $in: keys.map((k) => `recsug:${k}`.slice(0, 220)) } });
  delete all[userId];
  writeIds(all);
  return true;
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const doClean = process.argv.includes('--clean');
  if (!email || email.startsWith('--')) {
    console.log('วิธีใช้: node scripts/seedRecurringSuggest.js <อีเมลบัญชีทดสอบ> [--clean]');
    process.exit(1);
  }
  const servers = dnsServersFor(process.env);
  if (servers) dns.setServers(servers);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select('_id').lean();
  if (!user) { console.log('ไม่พบบัญชีอีเมลนี้ (ต้องสมัครสมาชิกไว้ก่อน)'); return; }
  const userId = String(user._id);

  const cleaned = await clean(userId);
  if (doClean) { console.log(cleaned ? 'ลบข้อมูลตัวอย่างเรียบร้อย' : 'ไม่มีข้อมูลตัวอย่างของบัญชีนี้'); return; }

  const cats = await Category.find({ $or: [{ user: null }, { user: userId }], type: 'expense', hidden: { $ne: true } }).lean();
  const cat = (name) => {
    const c = cats.find((x) => x.name === name) || cats.find((x) => x.name === 'อื่นๆ') || cats[0];
    if (!c) throw new Error('ไม่พบหมวดรายจ่าย');
    return c._id;
  };
  const today = todayTH();
  const dayNow = today.getUTCDate();
  // k = เดือนย้อนหลัง (0 = เดือนนี้) / เดือนนี้ใส่เฉพาะวันที่ผ่านมาแล้ว
  const on = (d, k) => {
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k + 1, 0)).getUTCDate();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, Math.min(d, last)));
  };
  const tx = [];
  const groups = new Set();
  const add = (catName, note, amount, d, k) => {
    if (k === 0 && d > dayNow) return;
    const category = cat(catName);
    tx.push({ user: userId, category, type: 'expense', amount, date: on(d, k), note });
    groups.add(keyOf(String(category), note));
  };
  // เดือนล่าสุดที่จ่ายได้: วันที่ยังไม่ถึงในเดือนนี้ → ใช้เดือนก่อนเป็นครั้งล่าสุด
  const lastK = (d) => (d <= dayNow ? 0 : -1);

  // ---- ควรชวน ----
  for (let i = 0; i < 4; i += 1) add('บริการสมาชิก', 'Netflix', 419, 15, lastK(15) - i);
  for (let i = 0; i < 2; i += 1) add('บริการสมาชิก', 'Spotify', 129, 3, lastK(3) - i);
  [599, 599, 620].forEach((a, i) => add('สาธารณูปโภค', 'ค่าเน็ตบ้าน', a, 5, lastK(5) - 2 + i));
  for (let i = 0; i < 3; i += 1) add('สุขภาพ', 'ค่ายิม', 890, 1, lastK(1) - i);
  // ---- ไม่ควรชวน ----
  for (let k = -2; k <= 0; k += 1) [2, 9, 16, 23].forEach((d) => add('อาหาร', 'กาแฟ', 65, d, k));
  [[-3, 6], [-2, 22], [-1, 11], [0, Math.min(dayNow, 8)]].forEach(([k, d]) => add('บันเทิง', 'ดูหนัง SF', 220, d, k));
  for (let k = -6; k <= -3; k += 1) add('สาธารณูปโภค', 'ค่าโทรศัพท์', 399, 10, k);

  const saved = await Transaction.insertMany(tx);
  const all = readIds();
  all[userId] = { transactions: saved.map((t) => String(t._id)), keys: [...groups], created_at: new Date().toISOString() };
  writeIds(all);
  console.log(`สร้างรายการตัวอย่างแล้ว ${tx.length} รายการ`);
  console.log('ระบบควรชวน 4 รายการ: Netflix, Spotify, ค่าเน็ตบ้าน, ค่ายิม (เปิดหน้ารายการที่เกิดซ้ำ)');
  console.log('ลบทีหลังได้ด้วย: node scripts/seedRecurringSuggest.js <อีเมล> --clean');
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
