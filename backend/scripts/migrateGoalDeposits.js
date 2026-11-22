// ย้ายประวัติการออมรุ่นแรก (collection goaldeposits) ไปเป็นรายการชนิด "saving" ใน transactions
// ยอดในเป้า (Goal.saved_amount) ไม่เปลี่ยน เพราะรวมยอดเหล่านี้ไว้แล้ว
// วิธีใช้ (ในโฟลเดอร์ backend):  node scripts/migrateGoalDeposits.js
// รันซ้ำได้: รายการที่ย้ายแล้วจะไม่ถูกสร้างซ้ำ (ย้ายเสร็จลบเอกสารเดิมทิ้ง)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const Goal = require('../models/Goal');
const Transaction = require('../models/Transaction');

const dayOf = (d) => {
  const th = new Date(new Date(d).getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate()));
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection('goaldeposits');
  const deps = await col.find({}).toArray();
  let moved = 0;
  for (const d of deps) {
    const goal = await Goal.findById(d.goal).select('name').lean();
    await Transaction.create({
      user: d.user, type: 'saving', amount: d.amount, date: d.date || dayOf(d.createdAt),
      goal: d.goal, goal_name: goal ? goal.name : '',
    });
    await col.deleteOne({ _id: d._id });
    moved += 1;
  }
  console.log(`ย้ายประวัติการออม ${moved} รายการ ไปเป็นรายการ "ออม" ในหน้ารายการแล้ว`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
