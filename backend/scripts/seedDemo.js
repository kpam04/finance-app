// สร้างข้อมูลตัวอย่างลงบัญชีทดสอบ (ไว้ทดลองหน้าเว็บ) / ลบเฉพาะข้อมูลที่สคริปต์นี้สร้าง
//  รันในโฟลเดอร์ backend:
//    node scripts/seedDemo.js <อีเมลบัญชีทดสอบ>          สร้างใหม่ (ลบข้อมูลทดลองชุดเดิมของบัญชีนี้ก่อน)
//    node scripts/seedDemo.js <อีเมลบัญชีทดสอบ> --clean  ลบข้อมูลทดลองของบัญชีนี้
//  - เพิ่มข้อมูลเข้าไป ไม่ลบ/ไม่แก้ข้อมูลเดิมของบัญชี (งบหมวดที่มีอยู่แล้วในเดือนนี้จะข้าม)
//  - จดรหัสของที่สร้างไว้ใน scripts/.demo-seed.json (อยู่ในเครื่องเท่านั้น) ใช้ตอน --clean
//  - วันที่ทั้งหมดคิดจากวันที่รัน: มีบิลค้างชำระ / บิลครบกำหนดใน 2 วัน (แจ้งเตือนกระดิ่ง) ทุกครั้งที่รัน
//  - ชื่อ/บันทึกช่วยจำของทุกอย่างมี "(ทดลอง)"
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const dns = require('node:dns');
const mongoose = require('mongoose');
const { dnsServersFor } = require('../utils/runtimeConfig');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Installment = require('../models/Installment');
const Goal = require('../models/Goal');
const { buildAmounts } = require('../services/installments');

const IDS_FILE = path.join(__dirname, '.demo-seed.json');
const TAG = '(ทดลอง)';
const DAY = 86400000;

// วันที่ตามเวลาไทย เก็บเป็น UTC เที่ยงคืน (รูปแบบเดียวกับรายการในแอป)
const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthShift = (ymStr, n) => { const [y, m] = ymStr.split('-').map(Number); const i = y * 12 + (m - 1) + n; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const dayIn = (y, m0, d) => new Date(Date.UTC(y, m0, Math.min(d, new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate())));
// ตัวเลขสุ่มแบบกำหนดผลได้ (รันกี่ครั้งก็ได้ข้อมูลหน้าตาเดิม)
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const between = (a, b) => Math.round(a + rnd() * (b - a));

function readIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch { return {}; } }
function writeIds(all) { fs.writeFileSync(IDS_FILE, JSON.stringify(all, null, 2)); }

async function clean(userId) {
  const all = readIds();
  const mine = all[userId];
  if (!mine) return false;
  await Transaction.deleteMany({ _id: { $in: mine.transactions || [] }, user: userId });
  await Budget.deleteMany({ _id: { $in: mine.budgets || [] }, user: userId });
  await Installment.deleteMany({ _id: { $in: mine.installments || [] }, user: userId });
  await Goal.deleteMany({ _id: { $in: mine.goals || [] }, user: userId });
  // รายจ่ายที่ผู้ใช้กด "จ่ายแล้ว" ของงวดผ่อนทดลองหลังรันสคริปต์ (ไม่อยู่ในรายการรหัส)
  await Transaction.deleteMany({ user: userId, installment: { $in: mine.installments || [] } });
  delete all[userId];
  writeIds(all);
  return true;
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const doClean = process.argv.includes('--clean');
  if (!email || email.startsWith('--')) {
    console.log('วิธีใช้: node scripts/seedDemo.js <อีเมลบัญชีทดสอบ> [--clean]');
    process.exit(1);
  }
  const servers = dnsServersFor(process.env);
  if (servers) dns.setServers(servers);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select('_id').lean();
  if (!user) { console.log('ไม่พบบัญชีอีเมลนี้ (ต้องสมัครสมาชิกไว้ก่อน)'); return; }
  const userId = String(user._id);

  const cleaned = await clean(userId);
  if (doClean) { console.log(cleaned ? 'ลบข้อมูลทดลองเรียบร้อย' : 'ไม่มีข้อมูลทดลองของบัญชีนี้'); return; }
  if (cleaned) console.log('ลบข้อมูลทดลองชุดเดิมแล้ว กำลังสร้างใหม่...');

  const cats = await Category.find({ $or: [{ user: null }, { user: userId }], hidden: { $ne: true } }).lean();
  const cat = (name, type = 'expense') => {
    const c = cats.find((x) => x.name === name && x.type === type) || cats.find((x) => x.type === type);
    if (!c) throw new Error(`ไม่พบหมวด${type === 'income' ? 'รายรับ' : 'รายจ่าย'}`);
    return c._id;
  };
  const ids = { transactions: [], budgets: [], installments: [], goals: [], created_at: new Date().toISOString() };
  const today = todayTH();

  // ---------- รายรับ/รายจ่าย 3 เดือนเต็มก่อนหน้า + เดือนนี้ถึงวันนี้ ----------
  const tx = [];
  const add = (category, type, amount, date, note) => tx.push({ user: userId, category, type, amount, date, note: `${note} ${TAG}` });
  for (let k = -3; k <= 0; k += 1) {
    const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
    const y = base.getUTCFullYear(); const m0 = base.getUTCMonth();
    const last = k === 0 ? today.getUTCDate() : new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    const on = (d) => dayIn(y, m0, d);
    add(cat('เงินเดือน', 'income'), 'income', 25000, on(1), 'เงินเดือน');
    if (k < 0 || last >= 15) add(cat('รายได้เสริม', 'income'), 'income', between(2500, 4000), on(15), 'งานฟรีแลนซ์');
    if (last >= 2) add(cat('ที่พัก/ค่าเช่า'), 'expense', 6500, on(2), 'ค่าห้อง');
    if (last >= 5) add(cat('สาธารณูปโภค'), 'expense', between(900, 1400), on(5), 'ค่าไฟ ค่าน้ำ');
    for (let d = 1; d <= last; d += 1) {
      add(cat('อาหาร'), 'expense', between(90, 190), on(d), d % 3 === 0 ? 'ข้าวเย็น' : 'ข้าวกลางวัน');
      if (d % 2 === 0) add(cat('เดินทาง'), 'expense', between(40, 90), on(d), 'ค่ารถ');
    }
    for (const d of [7, 19, 27]) if (d <= last) add(cat('ช้อปปิ้ง'), 'expense', between(300, 900), on(d), 'ของใช้');
    if (last >= 21) add(cat('บันเทิง'), 'expense', between(250, 450), on(21), 'ดูหนัง');
  }
  const savedTx = await Transaction.insertMany(tx);
  ids.transactions.push(...savedTx.map((t) => String(t._id)));

  // ---------- งบประมาณเดือนนี้ (ข้ามหมวดที่มีงบอยู่แล้ว) ----------
  const thai = new Date(Date.now() + 7 * 3600 * 1000);
  const month = thai.getUTCMonth() + 1; const year = thai.getUTCFullYear();
  for (const [name, limit] of [['อาหาร', 5000], ['เดินทาง', 1500], ['ช้อปปิ้ง', 3000], ['บันเทิง', 800], ['ที่พัก/ค่าเช่า', 6500]]) {
    const category = cat(name);
    if (await Budget.exists({ user: userId, category, month, year })) continue;
    const b = await Budget.create({ user: userId, category, month, year, amountLimit: limit, alertThreshold: 80, repeat: false });
    ids.budgets.push(String(b._id));
  }

  // ---------- รายการผ่อน ----------
  // วางงวดที่ n ให้ครบกำหนดวันที่ target: เดือนของงวดแรก = เดือนของ target − (n − 1)
  const plan = async ({ name, channel, channel_name = '', category, price, months, per, total = null, target, nth, prepaid = 0, status = 'active', payoff = null }) => {
    const amounts = buildAmounts({ months, per, total, equal: true });
    const schedule = amounts.map((a, i) => ({ n: i + 1, amount: a, paid: i < prepaid, prepaid: i < prepaid, paid_amount: i < prepaid ? a : null }));
    const doc = {
      user: userId, name: `${name} ${TAG}`, channel, channel_name, category, price, down_payment: 0, months,
      due_day: target.getUTCDate(), first_month: monthShift(ym(target), -(nth - 1)), total_payable: total, equal: true,
      schedule, status, closed_at: status === 'done' ? addDays(today, -5) : null,
    };
    const p = await Installment.create(doc);
    ids.installments.push(String(p._id));
    if (payoff) {
      // ปิดยอดก่อนกำหนด: บันทึกรายจ่าย 1 รายการ ปิดทุกงวดที่เหลือ
      const open = schedule.filter((s) => !s.paid);
      const remaining = open.reduce((s, it) => s + it.amount, 0);
      const t = await Transaction.create({ user: userId, category, type: 'expense', amount: payoff, date: addDays(today, -5), note: `ปิดยอด ${doc.name}`, installment: p._id, installment_n: open[0].n });
      ids.transactions.push(String(t._id));
      const sch = schedule.map((s) => (s.paid ? s : { ...s, paid: true, payoff: true, paid_at: addDays(today, -5), paid_amount: s.n === open[0].n ? payoff : 0, transaction: s.n === open[0].n ? t._id : null }));
      await Installment.updateOne({ _id: p._id }, { $set: { schedule: sch, status: 'done', closed_at: addDays(today, -5), payoff: { remaining, amount: payoff, date: addDays(today, -5), transaction: t._id } } });
    }
  };
  const overdue = addDays(today, -2);  // ค้างชำระ 2 วัน
  const soon = addDays(today, 2);      // ครบกำหนดอีก 2 วัน (ขึ้นแจ้งเตือนกระดิ่ง)
  const later = addDays(today, 12);
  await plan({ name: 'หูฟังไร้สาย', channel: 'spaylater', category: cat('ช้อปปิ้ง'), price: 3300, months: 6, per: 583, target: overdue, nth: 3, prepaid: 2 });
  await plan({ name: 'รองเท้าวิ่ง', channel: 'spaylater', category: cat('ช้อปปิ้ง'), price: 2200, months: 3, per: 762, total: 2287, target: overdue, nth: 1 });
  await plan({ name: 'iPhone 16', channel: 'credit_card', channel_name: 'KBank', category: cat('ช้อปปิ้ง'), price: 29900, months: 10, per: 3090, target: soon, nth: 2, prepaid: 1 });
  await plan({ name: 'หม้อทอดไร้น้ำมัน', channel: 'lazpaylater', category: cat('ช้อปปิ้ง'), price: 2400, months: 4, per: 600, target: later, nth: 1 });
  await plan({ name: 'คอร์สเรียนภาษา', channel: 'store', channel_name: 'สถาบันภาษา', category: cat('การศึกษา'), price: 4500, months: 3, per: 1500, target: addDays(today, -40), nth: 3, prepaid: 3, status: 'done' });
  await plan({ name: 'แท็บเล็ต', channel: 'credit_card', channel_name: 'KBank', category: cat('ช้อปปิ้ง'), price: 12000, months: 10, per: 1260, target: addDays(today, -35), nth: 4, prepaid: 4, payoff: 7200 });

  // ---------- เป้าหมายออม (ใส่ตรงเพื่อกำหนดวันที่สร้าง/สำเร็จได้) ----------
  const goals = [
    { name: `ทริปญี่ปุ่น ${TAG}`, target_amount: 30000, saved_amount: 13500, target_date: addDays(today, 240), completed_at: null, createdAt: addDays(today, -120) },
    { name: `กองทุนฉุกเฉิน ${TAG}`, target_amount: 50000, saved_amount: 5000, target_date: addDays(today, 420), completed_at: null, createdAt: addDays(today, -60) },
    { name: `ซื้อเก้าอี้ทำงาน ${TAG}`, target_amount: 4000, saved_amount: 4000, target_date: addDays(today, 10), completed_at: addDays(today, -20), createdAt: addDays(today, -110) },
  ];
  for (const g of goals) {
    const r = await Goal.collection.insertOne({ user: new mongoose.Types.ObjectId(userId), ...g, updatedAt: g.completed_at || new Date(), __v: 0 });
    ids.goals.push(String(r.insertedId));
  }

  const all = readIds();
  all[userId] = ids;
  writeIds(all);
  console.log(`สร้างข้อมูลทดลองแล้ว: รายการ ${ids.transactions.length}, งบ ${ids.budgets.length}, รายการผ่อน ${ids.installments.length}, เป้าหมาย ${ids.goals.length}`);
  console.log('ลบทีหลังได้ด้วย: node scripts/seedDemo.js <อีเมล> --clean');
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
