// ล้างข้อมูลการเงินทั้งหมดของ "บัญชีทดสอบ" แล้วสร้างข้อมูลตัวอย่างชุดใหม่ที่เป็นเรื่องเดียวกัน (ย้อนหลังหลายเดือน)
//  รันในโฟลเดอร์ backend:
//    node scripts/seedFresh.js <อีเมล>              ดูก่อนว่าจะลบอะไรบ้าง (ยังไม่ลบ)
//    node scripts/seedFresh.js <อีเมล> --yes        ลบแล้วสร้างใหม่ (ย้อนหลัง 6 เดือน + เดือนนี้ถึงวันนี้)
//    node scripts/seedFresh.js <อีเมล> --yes --months=9   ย้อนหลังกี่เดือนก็ได้ (3-12)
//  ลบ: รายการ งบ รายการประจำ งวดผ่อน เป้าหมาย การแจ้งเตือน คำแนะนำ AI ที่เก็บไว้ หมวดที่สร้างเอง ของบัญชีนี้เท่านั้น
//  ไม่แตะ: ตัวบัญชี (ชื่อ ชื่อผู้ใช้ รหัสผ่าน นโยบาย) และข้อมูลของบัญชีอื่น
//  เรื่องราว: นักศึกษาทำงานพาร์ตไทม์ รายได้ ~20,000/เดือน ออม 2 เป้า (ฉุกเฉิน + โน้ตบุ๊ก) เป้าทริปญี่ปุ่นสำเร็จแล้วและใช้เงินไปบางส่วน
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
const mongoose = require('mongoose');
const { dnsServersFor } = require('../utils/runtimeConfig');
const User = require('../models/User');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Recurring = require('../models/Recurring');
const Installment = require('../models/Installment');
const Goal = require('../models/Goal');
const Notification = require('../models/Notification');
const PlanAdvice = require('../models/PlanAdvice');
const RecurringDismiss = require('../models/RecurringDismiss');
const { buildAmounts } = require('../services/installments');
const { syncBudget } = require('../services/budgetAlert');

const DAY = 86400000;
const todayTH = () => { const t = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysIn = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const dayIn = (y, m0, d) => new Date(Date.UTC(y, m0, Math.min(d, daysIn(y, m0))));
const ymOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const round100 = (n) => Math.max(100, Math.round(n / 100) * 100);
// สุ่มแบบกำหนดผลได้ (รันกี่ครั้งก็ได้หน้าตาเดิม)
let seed = 11;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const between = (a, b) => Math.round(a + rnd() * (b - a));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

async function wipe(userId, dryRun) {
  const q = { user: userId };
  const models = [['รายการ', Transaction], ['งบ', Budget], ['รายการประจำ', Recurring], ['งวดผ่อน', Installment], ['เป้าหมาย', Goal],
    ['การแจ้งเตือน', Notification], ['คำแนะนำ AI ที่เก็บไว้', PlanAdvice], ['รายการที่ตอบ "ไม่ใช่"', RecurringDismiss], ['หมวดที่สร้างเอง', Category]];
  for (const [label, M] of models) {
    const n = await M.countDocuments(q);
    if (dryRun) console.log(`  ${label}: ${n}`);
    else await M.deleteMany(q);
  }
  // ประวัติการออมรุ่นแรก (ถ้ายังมี)
  const old = mongoose.connection.collection('goaldeposits');
  if (dryRun) console.log(`  ประวัติการออมรุ่นแรก: ${await old.countDocuments({ user: new mongoose.Types.ObjectId(userId) })}`);
  else await old.deleteMany({ user: new mongoose.Types.ObjectId(userId) });
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const yes = process.argv.includes('--yes');
  const mArg = process.argv.find((a) => a.startsWith('--months='));
  const MONTHS = Math.min(12, Math.max(3, mArg ? parseInt(mArg.split('=')[1], 10) || 6 : 6));
  if (!email || email.startsWith('--')) {
    console.log('วิธีใช้: node scripts/seedFresh.js <อีเมลบัญชีทดสอบ> [--yes] [--months=6]');
    process.exit(1);
  }
  const servers = dnsServersFor(process.env);
  if (servers) dns.setServers(servers);
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email }).select('_id role').lean();
  if (!user) { console.log('ไม่พบบัญชีอีเมลนี้'); return; }
  const userId = String(user._id);

  if (!yes) {
    console.log(`บัญชี ${email} มีข้อมูลที่จะถูกลบ:`);
    await wipe(userId, true);
    console.log('ถ้าแน่ใจ รันอีกครั้งพร้อม --yes');
    return;
  }
  await wipe(userId, false);
  console.log('ลบข้อมูลเดิมแล้ว กำลังสร้างชุดใหม่...');

  const cats = await Category.find({ user: null }).lean();
  const cat = (name, type = 'expense') => {
    const c = cats.find((x) => x.name === name && x.type === type) || cats.find((x) => x.type === type);
    if (!c) throw new Error(`ไม่พบหมวด ${name}`);
    return c._id;
  };
  const C = {
    salary: cat('เงินเดือน', 'income'), side: cat('รายได้เสริม', 'income'), gift: cat('ของขวัญ/โบนัส', 'income'),
    food: cat('อาหาร'), travel: cat('เดินทาง'), rent: cat('ที่พัก/ค่าเช่า'), shop: cat('ช้อปปิ้ง'), util: cat('สาธารณูปโภค'),
    health: cat('สุขภาพ'), fun: cat('บันเทิง'), edu: cat('การศึกษา'), sub: cat('บริการสมาชิก'),
  };
  const uid = new mongoose.Types.ObjectId(userId);
  const today = todayTH();
  const months = []; // [{ y, m0, last, k }] เก่าสุด → เดือนนี้
  for (let k = -MONTHS; k <= 0; k += 1) {
    const b = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
    const y = b.getUTCFullYear(); const m0 = b.getUTCMonth();
    months.push({ y, m0, k, last: k === 0 ? today.getUTCDate() : daysIn(y, m0) });
  }
  const tx = [];
  const add = (o) => tx.push({ user: uid, note: '', ...o });

  // ---------- รายการประจำ (กฎ + รายการที่เกิดแล้ว) ----------
  const recDefs = [
    { key: 'salary', category: C.salary, type: 'income', amount: 15000, note: 'เงินเดือนพาร์ตไทม์', day: 1 },
    { key: 'rent', category: C.rent, type: 'expense', amount: 4500, note: 'ค่าหอพัก', day: 3 },
    { key: 'phone', category: C.util, type: 'expense', amount: 399, note: 'ค่าโทรศัพท์รายเดือน', day: 10 },
    { key: 'netflix', category: C.sub, type: 'expense', amount: 169, note: 'Netflix', day: 15 },
  ];
  const first = months[0];
  for (const r of recDefs) {
    const startDate = dayIn(first.y, first.m0, r.day);
    // รอบถัดไปหลังวันนี้ (รอบของวันนี้สร้างเป็นรายการแล้ว)
    let next = dayIn(today.getUTCFullYear(), today.getUTCMonth(), r.day);
    if (next <= today) next = dayIn(today.getUTCFullYear(), today.getUTCMonth() + 1, r.day);
    const rule = await Recurring.create({ user: uid, category: r.category, type: r.type, amount: r.amount, note: r.note, frequency: 'monthly', startDate, nextRun: next, isActive: true });
    for (const mo of months) if (r.day <= mo.last) add({ category: r.category, type: r.type, amount: r.amount, note: r.note, date: dayIn(mo.y, mo.m0, r.day), recurring: rule._id });
  }

  // ---------- รายรับอื่น / รายจ่ายรายวัน ----------
  const lunch = ['ข้าวกะเพรา', 'ก๋วยเตี๋ยว', 'ข้าวมันไก่', 'ข้าวผัด', 'ส้มตำ ไก่ย่าง', 'ข้าวขาหมู'];
  const dinner = ['ข้าวเย็น', 'อาหารตามสั่ง', 'ชาบู', 'ร้านข้าวหน้าหอ', 'สุกี้'];
  for (const mo of months) {
    const on = (d) => dayIn(mo.y, mo.m0, d);
    const late = mo.k === -1; // เดือนก่อน: ไปญี่ปุ่น ใช้จ่ายมากกว่าปกติ (ส่วนใหญ่จ่ายจากเงินออม)
    if (mo.last >= 5) add({ category: C.gift, type: 'income', amount: 5000, note: 'เงินจากที่บ้าน', date: on(5) });
    if (mo.k % 2 === 0 && mo.last >= 20) add({ category: C.side, type: 'income', amount: between(1500, 3000), note: 'รับจ้างทำสไลด์', date: on(20) });
    for (let d = 1; d <= mo.last; d += 1) {
      add({ category: C.food, type: 'expense', amount: between(45, 80), note: pick(lunch), date: on(d) });
      if (rnd() < 0.8) add({ category: C.food, type: 'expense', amount: between(60, 140), note: pick(dinner), date: on(d) });
      if (rnd() < 0.3) add({ category: C.food, type: 'expense', amount: between(45, 75), note: 'กาแฟ', date: on(d) });
      if (rnd() < 0.45) add({ category: C.travel, type: 'expense', amount: between(15, 45), note: pick(['ค่ารถเมล์', 'วินมอเตอร์ไซค์', 'BTS']), date: on(d) });
    }
    // ช้อปปิ้ง: ปกติ 2-3 ครั้ง / เดือนนี้สูงผิดปกติ (ให้เห็นการเตือนในหน้าวางแผน)
    const shopDays = [8, 18, 26].filter((d) => d <= mo.last);
    for (const d of shopDays) add({ category: C.shop, type: 'expense', amount: between(250, 700), note: pick(['ของใช้ในหอ', 'เสื้อผ้า', 'ของใช้ส่วนตัว']), date: on(d) });
    if (mo.k === 0) {
      for (const [d, a, n] of [[11, 1890, 'ลดราคา 11.11 รองเท้า'], [11, 1250, 'ลดราคา 11.11 กระเป๋า'], [Math.min(mo.last, 17), 980, 'หูฟัง']]) if (d <= mo.last) add({ category: C.shop, type: 'expense', amount: a, note: n, date: on(d) });
    }
    if (mo.last >= 13) add({ category: C.fun, type: 'expense', amount: between(220, 400), note: 'ดูหนัง', date: on(13) });
    if (mo.last >= 24) add({ category: C.fun, type: 'expense', amount: between(300, 600), note: 'กินเลี้ยงกับเพื่อน', date: on(24) });
    if (mo.k % 3 === 0 && mo.last >= 16) add({ category: C.health, type: 'expense', amount: between(150, 450), note: 'ยา / คลินิก', date: on(16) });
    if ((mo.k === -MONTHS || mo.k === -3) && mo.last >= 7) add({ category: C.edu, type: 'expense', amount: between(450, 900), note: 'หนังสือเรียน', date: on(7) });
    if (late && mo.last >= 9) add({ category: C.food, type: 'expense', amount: 1200, note: 'ของฝากจากญี่ปุ่น', date: on(9) });
  }

  // ---------- งวดผ่อน: โทรศัพท์ 10 งวด เริ่ม 4 เดือนก่อน จ่ายแล้วทุกงวดที่ถึงกำหนดก่อนเดือนนี้ ----------
  const phoneCat = C.shop;
  const firstInst = months[Math.max(0, months.length - 5)]; // 4 เดือนก่อน
  const amounts = buildAmounts({ months: 10, per: 1290, total: null, equal: true });
  const instId = new mongoose.Types.ObjectId();
  const schedule = amounts.map((a, i) => ({ n: i + 1, amount: a, paid: false, paid_amount: null, paid_at: null, prepaid: false, transaction: null, payoff: false }));
  for (let i = 0; i < 4; i += 1) {
    const mo = months[months.indexOf(firstInst) + i];
    const due = mo ? dayIn(mo.y, mo.m0, 25) : null;
    if (!due || due > today) break; // จ่ายเฉพาะงวดที่ถึงกำหนดแล้ว
    const tId = new mongoose.Types.ObjectId();
    add({ _id: tId, category: phoneCat, type: 'expense', amount: amounts[i], note: `ผ่อนโทรศัพท์ งวดที่ ${i + 1}`, date: due, installment: instId, installment_n: i + 1 });
    Object.assign(schedule[i], { paid: true, paid_amount: amounts[i], paid_at: due, transaction: tId });
  }
  await Installment.create({ _id: instId, user: uid, name: 'โทรศัพท์มือถือ', channel: 'credit_card', channel_name: 'KBank', category: phoneCat, price: 12900, down_payment: 0, months: 10, due_day: 25, first_month: ymOf(dayIn(firstInst.y, firstInst.m0, 1)), equal: true, schedule, status: 'active' });

  // ---------- เป้าหมายออม (ออม/ถอนเป็นรายการชนิด saving / withdraw) ----------
  const goalJp = new mongoose.Types.ObjectId();
  const goalEm = new mongoose.Types.ObjectId();
  const goalNb = new mongoose.Types.ObjectId();
  let jp = 0; let em = 0; let nb = 0;
  const jpDone = months[months.length - 3]; // ออมครบ 2 เดือนก่อน
  const jpMonths = months.filter((mo) => mo.k <= jpDone.k).length;
  const jpPer = Math.ceil(15000 / jpMonths / 100) * 100;
  for (const mo of months) {
    const on = (d) => dayIn(mo.y, mo.m0, d);
    if (mo.last < 2) continue;
    // ทริปญี่ปุ่น: เฉลี่ยเท่า ๆ กันทุกเดือนจนครบ 15,000 (ครบ 2 เดือนก่อน)
    if (jp < 15000 && mo.y * 12 + mo.m0 <= jpDone.y * 12 + jpDone.m0) {
      const a = Math.min(jpPer, 15000 - jp);
      add({ type: 'saving', amount: a, date: on(2), goal: goalJp, goal_name: 'ทริปญี่ปุ่น' }); jp += a;
    }
    // กองทุนฉุกเฉิน: เดือนละ 2,000 ตั้งแต่ 5 เดือนก่อน
    if (mo.k >= -5) { add({ type: 'saving', amount: 2000, date: on(2), goal: goalEm, goal_name: 'กองทุนฉุกเฉิน' }); em += 2000; }
    // ซื้อโน้ตบุ๊ก: เริ่มเดือนก่อน เดือนละ 1,500
    if (mo.k >= -1) { add({ type: 'saving', amount: 1500, date: on(2), goal: goalNb, goal_name: 'ซื้อโน้ตบุ๊ก' }); nb += 1500; }
    // ถอนฉุกเฉิน 1 ครั้ง (3 เดือนก่อน)
    if (mo.k === -3 && mo.last >= 17) { add({ type: 'withdraw', amount: 1500, date: on(17), goal: goalEm, goal_name: 'กองทุนฉุกเฉิน', reason: 'เหตุฉุกเฉิน: ค่าทำฟัน' }); em -= 1500; }
  }
  // ไปญี่ปุ่นเดือนก่อน: จ่ายจากเงินออมของเป้าที่สำเร็จแล้ว (เหลือในเป้าบางส่วน)
  const trip = months[months.length - 2];
  const jpUse = [[3, C.travel, 8900, 'ตั๋วเครื่องบินไปโตเกียว'], [4, C.rent, 3800, 'ที่พักโตเกียว 4 คืน']];
  if (trip.last >= 6) add({ category: C.fun, type: 'expense', amount: 2600, note: 'บัตรเที่ยวสวนสนุก (จ่ายเอง)', date: dayIn(trip.y, trip.m0, 6) });
  let jpLeft = jp;
  for (const [d, category, amount, note] of jpUse) {
    const used = Math.min(amount, jpLeft); jpLeft -= used;
    add({ category, type: 'expense', amount, note, date: dayIn(trip.y, trip.m0, d), goal: goalJp, goal_name: 'ทริปญี่ปุ่น', goal_used: used });
  }
  const created = (mo, d = 1) => dayIn(mo.y, mo.m0, d);
  await Goal.collection.insertMany([
    { _id: goalJp, user: uid, name: 'ทริปญี่ปุ่น', target_amount: 15000, saved_amount: jp, target_date: dayIn(jpDone.y, jpDone.m0 + 2, 1), completed_at: dayIn(jpDone.y, jpDone.m0, 2), createdAt: created(months[0]), updatedAt: dayIn(jpDone.y, jpDone.m0, 2), __v: 0 },
    { _id: goalEm, user: uid, name: 'กองทุนฉุกเฉิน', target_amount: 30000, saved_amount: em, target_date: addDays(today, 300), completed_at: null, createdAt: created(months[Math.max(0, months.length - 6)]), updatedAt: new Date(), __v: 0 },
    { _id: goalNb, user: uid, name: 'ซื้อโน้ตบุ๊ก', target_amount: 25000, saved_amount: nb, target_date: addDays(today, 420), completed_at: null, createdAt: created(months[months.length - 2]), updatedAt: new Date(), __v: 0 },
  ]);

  await Transaction.insertMany(tx);

  // ---------- งบประมาณ: ทุกเดือน (เดือนเก่าใช้วงเงินปกติ / เดือนนี้ตั้งให้เห็นครบทุกสถานะ) ----------
  const spentOf = (category, mo) => tx.filter((t) => t.type === 'expense' && String(t.category) === String(category) && t.date.getUTCFullYear() === mo.y && t.date.getUTCMonth() === mo.m0).reduce((s, t) => s + t.amount - (t.goal_used || 0), 0);
  const normal = [[C.food, 6500], [C.travel, 700], [C.shop, 2500], [C.fun, 900], [C.sub, 200]];
  const budgets = [];
  for (const mo of months) {
    for (const [category, limit] of normal) {
      let amountLimit = limit;
      if (mo.k === 0) {
        // เดือนนี้: อาหาร = เฝ้าระวัง (~85%) / เดินทาง = ปกติ / ช้อปปิ้ง = เกินงบมาก (~160%) / บันเทิง = ใกล้หมด / บริการสมาชิก = ชำระแล้ว
        const s = spentOf(category, mo);
        const ratio = { [String(C.food)]: 0.85, [String(C.shop)]: 1.6, [String(C.fun)]: 0.97 }[String(category)];
        if (ratio && s > 0) amountLimit = round100(s / ratio);
      }
      budgets.push({ user: uid, category, month: mo.m0 + 1, year: mo.y, amountLimit, alertThreshold: 80, repeat: true });
    }
  }
  const saved = await Budget.insertMany(budgets);
  for (const b of saved) await syncBudget(b.toObject(), { notify: false }); // ตั้งระดับแจ้งเตือนให้ตรงกับยอดใช้ โดยไม่ส่งแจ้งเตือนรวดเดียว

  const count = (type) => tx.filter((t) => t.type === type).length;
  console.log(`สร้างใหม่แล้ว (${MONTHS} เดือนย้อนหลัง + เดือนนี้):`);
  console.log(`  รายรับ ${count('income')} | รายจ่าย ${count('expense')} | ออม ${count('saving')} | ถอน ${count('withdraw')}`);
  console.log(`  รายการประจำ ${recDefs.length} | งวดผ่อน 1 | งบ ${budgets.length} | เป้าหมาย 3 (กำลังออม 2, สำเร็จ 1)`);
  console.log(`  เป้า: ทริปญี่ปุ่น ${jp} (ใช้ไป ${jp - jpLeft}) | กองทุนฉุกเฉิน ${em} | ซื้อโน้ตบุ๊ก ${nb}`);
}

main()
  .catch((e) => { console.error('ผิดพลาด:', e.message); process.exitCode = 1; })
  .finally(() => mongoose.connection.close());
