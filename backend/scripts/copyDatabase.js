// คัดลอกข้อมูลทุกคอลเลกชันจากฐานข้อมูลหนึ่งไปอีกฐานข้อมูลหนึ่งใน cluster เดียวกัน
// คงรหัสเดิมของทุกแถว และไม่ลบต้นฉบับ ใช้ย้ายจากฐานข้อมูล "test" ไป "financeapp"
//
// วิธีใช้ (รันในโฟลเดอร์ backend ขณะที่ปิดเซิร์ฟเวอร์อยู่):
//   node scripts/copyDatabase.js --dry-run     ดูจำนวนที่จะคัดลอกก่อน (ยังไม่คัดลอกจริง)
//   node scripts/copyDatabase.js               คัดลอกจริง
// ตัวเลือก: --source test --target financeapp (ค่าเริ่มต้นคือสองชื่อนี้)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const { MongoClient } = mongoose.mongo;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const source = opt('--source', 'test');
const target = opt('--target', 'financeapp');
const dryRun = args.includes('--dry-run');
const BATCH = 500;

const listNames = async (db) =>
  (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

async function countAll(db, names) {
  const out = {};
  for (const n of names) out[n] = await db.collection(n).countDocuments();
  return out;
}

async function run() {
  if (source === target) {
    console.error('ฐานข้อมูลต้นทางและปลายทางต้องเป็นคนละชื่อกัน');
    return 1;
  }
  if (!process.env.MONGO_URI) {
    console.error('ไม่พบ MONGO_URI ในไฟล์ .env');
    return 1;
  }

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  try {
    const src = client.db(source);
    const dst = client.db(target);

    const names = await listNames(src);
    if (names.length === 0) {
      console.log(`ไม่พบคอลเลกชันในฐานข้อมูล "${source}" ไม่มีอะไรต้องคัดลอก`);
      return 0;
    }
    const srcCounts = await countAll(src, names);

    // ปลายทางต้องว่าง กันข้อมูลซ้ำ (เช่น หมวดมาตรฐานซ้ำสองชุดถ้าเปิดเซิร์ฟเวอร์ด้วยฐานข้อมูลใหม่ก่อนคัดลอก)
    const dstCounts = await countAll(dst, await listNames(dst));
    const used = Object.entries(dstCounts).filter(([, n]) => n > 0);
    if (used.length > 0) {
      console.error(`หยุดทำงาน: ฐานข้อมูลปลายทาง "${target}" มีข้อมูลอยู่แล้ว`);
      used.forEach(([n, c]) => console.error(`  - ${n}: ${c} แถว`));
      console.error('ถ้าเป็นข้อมูลที่สร้างจากการเปิดเซิร์ฟเวอร์ด้วยฐานข้อมูลใหม่ (เช่น หมวดมาตรฐาน)');
      console.error('ให้ลบคอลเลกชันเหล่านั้นในปลายทางผ่าน Atlas (Browse Collections) แล้วรันใหม่');
      return 1;
    }

    console.log(`ต้นทาง: ${source}  ->  ปลายทาง: ${target}${dryRun ? '  (โหมดดูจำนวน ยังไม่คัดลอกจริง)' : ''}`);
    console.table(names.map((n) => ({ คอลเลกชัน: n, 'จำนวนแถวต้นทาง': srcCounts[n] })));
    if (dryRun) return 0;

    for (const n of names) {
      if (srcCounts[n] === 0) continue;
      const to = dst.collection(n);
      let batch = [];
      for await (const doc of src.collection(n).find({})) {
        batch.push(doc);
        if (batch.length >= BATCH) {
          await to.insertMany(batch, { ordered: false });
          batch = [];
        }
      }
      if (batch.length > 0) await to.insertMany(batch, { ordered: false });
      console.log(`คัดลอก ${n} แล้ว`);
    }

    // ตรวจจำนวนหลังคัดลอก
    const after = await countAll(dst, names);
    const rows = names.map((n) => ({
      คอลเลกชัน: n,
      ต้นทาง: srcCounts[n],
      ปลายทาง: after[n],
      ผล: after[n] === srcCounts[n] ? 'ตรงกัน' : 'ไม่ตรงกัน',
    }));
    console.table(rows);
    if (rows.some((r) => r.ผล !== 'ตรงกัน')) {
      console.error('จำนวนแถวไม่ตรงกัน กรุณาอย่าเปลี่ยน .env และแจ้งผู้ช่วยพร้อมตารางด้านบน');
      return 1;
    }

    console.log('คัดลอกสำเร็จ ฐานข้อมูลต้นทางยังอยู่ครบ (ไม่ได้ลบ)');
    console.log(`ขั้นต่อไป: ตรวจให้แน่ใจว่า MONGO_URI ใน .env มี /${target} ก่อนเครื่องหมาย ? แล้วรัน node server.js`);
    return 0;
  } finally {
    await client.close();
  }
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });