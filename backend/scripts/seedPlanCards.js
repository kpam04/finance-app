// ข้อมูลตัวอย่าง "เดือนนี้" สำหรับดูการ์ดสรุปหน้าวางแผน (ใช้จ่ายต่อวัน / 7 วันล่าสุด / หมวดผิดปกติ)
//  ใช้ต่อจาก seedDemo.js (ต้องมีประวัติ 3 เดือนก่อนหน้าแล้ว) เพิ่มรายการเฉพาะเดือนนี้ ไม่แตะข้อมูลอื่น
//  รันในโฟลเดอร์ backend:
//    node scripts/seedPlanCards.js <อีเมล> [แบบ]       แบบ: down (ค่าเริ่มต้น) / up / splurge / fixed
//    node scripts/seedPlanCards.js <อีเมล> --clean     ลบเฉพาะรายการที่สคริปต์นี้สร้าง
//  แบบ:
//    down    ต้นเดือนใช้เยอะ 7 วันล่าสุดใช้น้อยลง → ป้ายเขียว "↓ ช่วงนี้ใช้น้อยลง"
//    up      ต้นเดือนปกติ 7 วันล่าสุดใช้เยอะ      → ป้ายส้ม "↑ ช่วงนี้ใช้เร็วขึ้น" + 7 วันล่าสุดสูงกว่าสัปดาห์ปกติ
//    splurge ซื้อของก้อนใหญ่ในหมวดบันเทิง/ช้อปปิ้ง → หมวดผิดปกติ + ปุ่ม "ตั้งงบเดือนหน้า"
//    fixed   ทดสอบการแยกค่าประจำ (ย้อนหลัง 3 เดือน + เดือนนี้ หมวดบันเทิงทั้งหมด):
//            Netflix ฿419 ทุกวันที่ 15 (จดเอง) → ระบบเดาว่าเป็นค่าประจำ
//            Spotify ฿129 ทุกวันที่ 3 แค่ 2 เดือน → เป็นค่าประจำ เพราะโน้ตมีชื่อบริการ
//            ดูหนัง ฿220 วันไม่ตรงกัน (โน้ต "ดูหนัง SF") → การใช้จ่ายปกติ
//            บัตรคอนเสิร์ต ฿3,400 เดือนนี้ → ก้อนใหญ่ครั้งเดียว ไม่ดันค่าเฉลี่ยต่อวัน แต่หมวดบันเทิงยังถูกเตือน
//  - รันซ้ำได้: ลบชุดเดิมของสคริปต์นี้ก่อนทุกครั้ง (เปลี่ยนแบบได้เลย)
//  - ป้ายทิศทางขึ้นเมื่อเดือนผ่านไปอย่างน้อย 10 วันเท่านั้น
//  - บันทึกช่วยจำมี "(ทดลองการ์ด)" / จดรหัสไว้ใน scripts/.demo-cards.json (อยู่ในเครื่องเท่านั้น)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dns = require('node:dns');
const mongoose = require('mongoose');
const { dnsServersFor } = require('../utils/runtimeConfig');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');

const IDS_FILE = path.join(__dirname, '.demo-cards.json');
const TAG = '(ทดลองการ์ด)';
const SCENARIOS = ['down', 'up', 'splurge', 'fixed'];

const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
let seed = 11;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const between = (a, b) => Math.round(a + rnd() * (b - a));

function readIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch { return {}; } }
function writeIds(all) { fs.writeFileSync(IDS_FILE, JSON.stringify(all, null, 2)); }

async function clean(userId) {
  const all = readIds();
  if (!all[userId]) return false;
  await Transaction.deleteMany({ _id: { $in: all[userId].transactions || [] }, user: userId });
  delete all[userId];
  writeIds(all);
  return true;
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const doClean = process.argv.includes('--clean');
  const scenario = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'down').toLowerCase();
  if (!email || email.startsWith('--') || (!doClean && !SCENARIOS.includes(scenario))) {
    console.log('วิธีใช้: node scripts/seedPlanCards.js <อีเมลบัญชีทดสอบ> [down|up|splurge|fixed] [--clean]');
    process.exit(1);
  }
  const servers = dnsServersFor(process.env);
  if (servers) dns.setServers(servers);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select('_id').lean();
  if (!user) { console.log('ไม่พบบัญชีอีเมลนี้ (ต้องสมัครสมาชิกไว้ก่อน)'); return; }
  const userId = String(user._id);

  const cleaned = await clean(userId);
  if (doClean) { console.log(cleaned ? 'ลบข้อมูลทดลองการ์ดเรียบร้อย' : 'ไม่มีข้อมูลทดลองการ์ดของบัญชีนี้'); return; }

  const today = todayTH();
  const dayNow = today.getUTCDate();
  if (dayNow < 10) console.log(`หมายเหตุ: วันนี้วันที่ ${dayNow} ป้ายทิศทางจะขึ้นเมื่อเดือนผ่านไปอย่างน้อย 10 วัน (การ์ดอื่นยังดูได้)`);

  const cats = await Category.find({ $or: [{ user: null }, { user: userId }], hidden: { $ne: true } }).lean();
  const cat = (name) => {
    const c = cats.find((x) => x.name === name && x.type === 'expense') || cats.find((x) => x.type === 'expense');
    if (!c) throw new Error('ไม่พบหมวดรายจ่าย');
    return c._id;
  };
  const on = (d, k = 0) => {
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k + 1, 0)).getUTCDate();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, Math.min(d, last)));
  };
  const tx = [];
  const add = (name, amount, d, note) => { if (d >= 1 && d <= dayNow) tx.push({ user: userId, category: cat(name), type: 'expense', amount, date: on(d), note: `${note} ${TAG}` }); };
  // k = เดือนย้อนหลัง (−3..0) / เดือนนี้ใส่เฉพาะวันที่ผ่านมาแล้ว
  const addM = (name, amount, d, k, note) => { if (k < 0 || d <= dayNow) tx.push({ user: userId, category: cat(name), type: 'expense', amount, date: on(d, k), note: `${note} ${TAG}` }); };
  const last7Start = dayNow - 6; // วันแรกของช่วง 7 วันล่าสุด (ภายในเดือนนี้)

  if (scenario === 'down') {
    // ต้นเดือน (ก่อนช่วง 7 วันล่าสุด) ใช้เพิ่มทุกวัน + ช้อปปิ้ง 2 ครั้ง
    for (let d = 1; d < last7Start; d += 1) add('อาหาร', between(180, 320), d, 'กินข้าวนอกบ้าน');
    add('ช้อปปิ้ง', 1800, Math.max(1, last7Start - 3), 'เสื้อผ้า');
    add('ช้อปปิ้ง', 1200, Math.max(1, last7Start - 1), 'ของใช้ในห้อง');
  } else if (scenario === 'up') {
    // 7 วันล่าสุดใช้เพิ่มทุกวัน + ช้อปปิ้ง 1 ครั้ง
    for (let d = Math.max(1, last7Start); d <= dayNow; d += 1) add('อาหาร', between(250, 400), d, 'กินข้าวนอกบ้าน');
    add('ช้อปปิ้ง', 1500, Math.max(1, dayNow - 2), 'ของใช้');
  } else if (scenario === 'fixed') {
    for (let k = -3; k <= 0; k += 1) addM('บันเทิง', 419, 15, k, 'Netflix');
    for (let k = -1; k <= 0; k += 1) addM('บันเทิง', 129, 3, k, 'Spotify');
    [[-3, 6], [-2, 22], [-1, 11], [0, Math.min(dayNow, 8)]].forEach(([k, d]) => addM('บันเทิง', 220, d, k, 'ดูหนัง SF'));
    addM('บันเทิง', 3400, Math.min(dayNow, 4), 0, 'บัตรคอนเสิร์ต');
  } else {
    // ซื้อก้อนใหญ่ช่วงต้นเดือน: บันเทิง (หมวดจ่ายเป็นก้อน) + ช้อปปิ้ง
    add('บันเทิง', 3400, Math.min(dayNow, 4), 'บัตรคอนเสิร์ต');
    add('ช้อปปิ้ง', 2600, Math.min(dayNow, 6), 'รองเท้าใหม่');
  }

  const saved = tx.length ? await Transaction.insertMany(tx) : [];
  const all = readIds();
  all[userId] = { scenario, transactions: saved.map((t) => String(t._id)), created_at: new Date().toISOString() };
  writeIds(all);
  const total = tx.reduce((s, t) => s + t.amount, 0);
  console.log(`สร้างข้อมูลแบบ "${scenario}" แล้ว: ${tx.length} รายการ รวม ฿${total.toLocaleString('en-US')} (ลบด้วย --clean หรือรันแบบอื่นทับได้เลย)`);
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
