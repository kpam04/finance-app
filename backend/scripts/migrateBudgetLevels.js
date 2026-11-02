// ตั้งระดับแจ้งเตือนเริ่มต้นของงบเดิมทุกรายการให้ตรงกับยอดใช้จ่ายปัจจุบัน แบบไม่ส่งแจ้งเตือน
// (กันกระดิ่งเด้งแจ้งเตือนรวดเดียวหลังติดตั้งกติกาแจ้งเตือนตามระดับ)
// วิธีใช้ (ในโฟลเดอร์ backend):  node scripts/migrateBudgetLevels.js
// รันซ้ำได้ ไม่ลบ/แก้ข้อมูลอื่น ไม่แตะการแจ้งเตือนเดิม
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const { syncBudget } = require('../services/budgetAlert');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const budgets = await Budget.find({}).lean();
  const counts = { 0: 0, 1: 0, 2: 0 };
  let changed = 0;
  for (const b of budgets) {
    const r = await syncBudget(b, { notify: false });
    counts[r.level] += 1;
    if (r.changed) changed += 1;
  }

  console.log(`งบทั้งหมด ${budgets.length} รายการ ปรับระดับ ${changed} รายการ (ไม่ส่งแจ้งเตือน)`);
  console.log(`ระดับ 0 (ปกติ): ${counts[0]} | ระดับ 1 (ถึงเกณฑ์): ${counts[1]} | ระดับ 2 (ถึง/เกิน 100%): ${counts[2]}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
