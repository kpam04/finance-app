// ข้อมูลตัวอย่างสำหรับทดสอบ "ตรวจการใช้จ่ายผิดปกติ" (ก + ข) ชุดเล็ก
//  รันในโฟลเดอร์ backend:
//    node scripts/seedUnusual.js <อีเมล>          สร้างใหม่ (ลบชุดเดิมของสคริปต์นี้ก่อนทุกครั้ง)
//    node scripts/seedUnusual.js <อีเมล> --clean  ลบเฉพาะของที่สคริปต์นี้สร้าง
//  ก) หมวดอาหาร: ข้าวราคา ฿80–160 ย้อนหลัง 3 เดือน (24 รายการ) → ลองบันทึก "อาหาร ฿850" จะขึ้นคำเตือนใต้ช่องจำนวนเงิน (ปกติราว ฿120)
//  ข) หมวดช้อปปิ้ง: 3 เดือนก่อนเดือนละ ฿2,000 (4 ครั้ง) / เดือนนี้ใช้มากกว่าปกติหลายเท่า → กระดิ่ง "หมวดช้อปปิ้ง… สูงกว่าปกติ"
//     (ต้องผ่านไปอย่างน้อย 7 วันของเดือน ถ้ายังไม่ถึงจะยังไม่แจ้ง)
//  - วันที่คิดจากวันที่รัน / จดรหัสไว้ใน scripts/.demo-unusual.json (อยู่ในเครื่องเท่านั้น)
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
const { checkCategorySpike } = require('../services/unusual');

const IDS_FILE = path.join(__dirname, '.demo-unusual.json');
const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
function readIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch { return {}; } }
function writeIds(all) { fs.writeFileSync(IDS_FILE, JSON.stringify(all, null, 2)); }

async function clean(userId) {
  const all = readIds();
  const mine = all[userId];
  if (!mine) return false;
  await Transaction.deleteMany({ _id: { $in: mine.transactions || [] }, user: userId });
  await Notification.deleteMany({ user: userId, key: { $in: mine.notices || [] } });
  delete all[userId];
  writeIds(all);
  return true;
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const doClean = process.argv.includes('--clean');
  if (!email || email.startsWith('--')) {
    console.log('วิธีใช้: node scripts/seedUnusual.js <อีเมลบัญชีทดสอบ> [--clean]');
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
  const cat = (name) => (cats.find((c) => c.name === name) || cats[0])._id;
  const today = todayTH();
  const dayNow = today.getUTCDate();
  const on = (d, k) => {
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k + 1, 0)).getUTCDate();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, Math.min(d, last)));
  };
  const tx = [];
  const add = (name, note, amount, d, k) => { if (k === 0 && d > dayNow) return; tx.push({ user: userId, category: cat(name), type: 'expense', amount, date: on(d, k), note }); };
  // ก) อาหาร ราคาปกติ 80–160 บาท เดือนละ 8 ครั้ง ย้อนหลัง 3 เดือน
  const food = [120, 95, 140, 110, 80, 150, 125, 100];
  for (let k = -3; k <= -1; k += 1) [2, 6, 9, 13, 17, 21, 25, 28].forEach((d, i) => add('อาหาร', 'ข้าวกลางวัน', food[(i + k + 3) % food.length] + k * -5, d, k));
  // ข) ช้อปปิ้ง เดือนก่อน ๆ เดือนละ ~2,000 / เดือนนี้ช่วงต้นเดือนใช้ไปมาก
  for (let k = -3; k <= -1; k += 1) [5, 12, 19, 26].forEach((d) => add('ช้อปปิ้ง', 'ของใช้', 500, d, k));
  [1, 2, 3, 4, 5, 6].forEach((d) => add('ช้อปปิ้ง', 'ของใช้', 700, d, 0));

  const saved = await Transaction.insertMany(tx);
  const notice = await checkCategorySpike(userId, cat('ช้อปปิ้ง'));
  const all = readIds();
  all[userId] = { transactions: saved.map((t) => String(t._id)), notices: notice ? [notice] : [], created_at: new Date().toISOString() };
  writeIds(all);
  console.log(`สร้างรายการตัวอย่างแล้ว ${tx.length} รายการ`);
  console.log('ก) ลองเพิ่มรายการ หมวดอาหาร ฿850 → ควรขึ้นคำเตือนใต้ช่องจำนวนเงิน');
  console.log(notice ? 'ข) แจ้งกระดิ่งหมวดช้อปปิ้งแล้ว' : `ข) ยังไม่แจ้งกระดิ่ง${dayNow < 7 ? ` (วันนี้วันที่ ${dayNow} ต้องผ่านไปอย่างน้อย 7 วันของเดือน)` : ' (อาจเคยแจ้งไปแล้วในเดือนนี้ หรือยอดยังไม่ถึงเกณฑ์)'}`);
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
