// ย้ายข้อมูลผู้ใช้เดิม: แยก fullName เป็นชื่อ (firstName) และนามสกุล (lastName)
// วิธีใช้ (ในโฟลเดอร์ backend):  node scripts/migrateUserNames.js
// รันซ้ำได้ ไม่กระทบผู้ใช้ที่ย้ายแล้ว
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const User = require('../models/User');
const { splitFullName } = require('../utils/userValidation');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({
    $or: [{ firstName: { $exists: false } }, { firstName: null }, { firstName: '' }],
  }).lean();

  let migrated = 0;
  const needLastName = [];

  for (const u of users) {
    let { firstName, lastName } = splitFullName(u.fullName);
    if (!firstName) firstName = String(u.email || 'ผู้ใช้').split('@')[0];
    await User.updateOne({ _id: u._id }, { $set: { firstName, lastName } });
    migrated += 1;
    if (!lastName) needLastName.push(u.email);
  }

  console.log(`ย้ายข้อมูลแล้ว ${migrated} บัญชี (ทั้งหมดที่ยังไม่ได้ย้าย ${users.length})`);
  if (needLastName.length) {
    console.log('บัญชีที่ยังไม่มีนามสกุล (ผู้ใช้ต้องเติมในหน้าโปรไฟล์):');
    needLastName.forEach((e) => console.log(' -', e));
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
