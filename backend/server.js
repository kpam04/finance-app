require('dotenv').config();
const dns = require('node:dns');
const cron = require('node-cron');
const mongoose = require('mongoose');
const { validateEnv, dnsServersFor } = require('./utils/runtimeConfig');

// ---------- ตรวจการตั้งค่าก่อนเริ่ม (บน production ถ้าผิดจะหยุดระบบทันทีพร้อมบอกสาเหตุ) ----------
const check = validateEnv(process.env);
check.warnings.forEach((w) => console.warn('[คำเตือน]', w));
if (check.errors.length) {
  check.errors.forEach((e) => console.error('[ผิดพลาด]', e));
  if (check.isProd) {
    console.error('ตั้งค่าไม่ครบ/ไม่ปลอดภัย ระบบหยุดเริ่มทำงาน (แก้ในหน้าตั้งค่า Environment แล้วเริ่มใหม่)');
    process.exit(1);
  }
}

const dnsServers = dnsServersFor(process.env);
if (dnsServers) dns.setServers(dnsServers);

const seedDefaultCategories = require('./seed/defaultCategories');
const { runDueRecurring } = require('./services/recurringRunner');
const { recordJobRun } = require('./services/jobRuns');
const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 3000;

// ประมวลผลรายการที่เกิดซ้ำ แล้วบันทึกผลรอบ (ให้หน้า admin ดูได้ว่างานรันจริงไหม)
async function processRecurring(trigger) {
  const startedAt = new Date();
  try {
    const r = await runDueRecurring();
    console.log(`[recurring:${trigger}] ${r.rules} rule(s), ${r.created} transaction(s) created`);
    await recordJobRun({ job: 'recurring', trigger, startedAt, rules: r.rules, created: r.created, errors: r.errors, ok: r.errors.length === 0 });
  } catch (e) {
    console.error(`[recurring:${trigger}] error:`, e.message);
    await recordJobRun({ job: 'recurring', trigger, startedAt, errors: [e.message], ok: false });
  }
}

let server = null;
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    await seedDefaultCategories();

    // รันชดเชยตอนเริ่มระบบ (กรณีเซิร์ฟเวอร์ปิด/หลับไปหลายวัน) แล้วตั้งเวลารันทุกวัน 00:05 น. เวลาไทย
    processRecurring('startup');
    cron.schedule('5 0 * * *', () => processRecurring('daily'), { timezone: 'Asia/Bangkok' });

    server = app.listen(PORT, () => console.log('Server running on port ' + PORT));
  })
  .catch((err) => {
    // เชื่อมฐานข้อมูลไม่ได้: หยุดทันที (ให้ Render เริ่มใหม่) ไม่ปล่อยให้ค้างโดยไม่รับคำขอ
    console.error('เชื่อมต่อฐานข้อมูลไม่สำเร็จ:', err.message);
    process.exit(1);
  });

// ปิดอย่างนุ่มนวลเมื่อ Render ส่งสัญญาณหยุด (ตอน deploy ใหม่)
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  const done = () => mongoose.connection.close().finally(() => process.exit(0));
  if (server) server.close(done); else done();
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.message ? e.message : e));
