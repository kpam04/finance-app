// ย้ายข้อมูลผู้ใช้เดิมให้มีฟิลด์ของรอบ A (บทบาท สถานะ เลขเวอร์ชัน token)
// วิธีใช้ (ในโฟลเดอร์ backend):  node scripts/migrateRoles.js
// รันซ้ำได้ ไม่กระทบบัญชีที่มีค่าอยู่แล้ว ไม่ลบหรือแก้ข้อมูลอื่น
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const steps = [
    ['role', 'user'],
    ['status', 'active'],
    ['tokenVersion', 0],
  ];
  for (const [field, value] of steps) {
    const r = await User.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    console.log(`${field}: ตั้งค่าเริ่มต้นให้ ${r.modifiedCount} บัญชี`);
  }

  const total = await User.countDocuments({});
  const owners = await User.countDocuments({ role: 'owner' });
  console.log(`ผู้ใช้ทั้งหมด ${total} บัญชี (เจ้าของ ${owners})`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
