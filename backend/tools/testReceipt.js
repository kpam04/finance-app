// ทดสอบการอ่านใบเสร็จกับรูปจริงของคุณ (ใช้ตอนจูนคำสั่ง) รันในโฟลเดอร์ backend:
//   node tools\testReceipt.js "D:\รูป\ใบเสร็จ1.jpg"           อ่านรูป -> แสดงข้อความที่ OCR ได้ + ผลที่จัดโครงสร้าง + เวลา
//   node tools\testReceipt.js "D:\รูป\ใบเสร็จ1.jpg" --ocr-only  เฉพาะ OCR (ดูว่าโมเดลอ่านได้ถูกไหม)
// อ่านคีย์จาก backend\.env (AI_API_KEY) ไม่พิมพ์คีย์ ข้อความที่แสดงอาจมีข้อมูลส่วนตัวจากใบเสร็จ (แสดงในเครื่องคุณเท่านั้น)
// ใช้ส่งขึ้นเว็บจริงไม่ได้ เป็นเครื่องมือในเครื่อง ไม่ผ่านระบบผู้ใช้/โควต้า
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { aiConfig } = require('../services/ai/aiClient');
const { ocrImage } = require('../services/ai/ocrClient');
const { parseReceiptWithAi } = require('../services/ai/parseReceipt');

const DEFAULT_CATEGORIES = ['อาหาร', 'เดินทาง', 'ที่พัก/ค่าเช่า', 'ช้อปปิ้ง', 'สาธารณูปโภค', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'สัตว์เลี้ยง', 'บริการสมาชิก', 'อื่นๆ'];

(async () => {
  const file = process.argv[2];
  const ocrOnly = process.argv.includes('--ocr-only');
  if (!file) { console.log('วิธีใช้: node tools\\testReceipt.js "ที่อยู่ไฟล์รูป.jpg" [--ocr-only]'); process.exit(1); }
  if (!fs.existsSync(file)) { console.log('ไม่พบไฟล์ที่ระบุ: ' + file + '\nตรวจชื่อไฟล์และโฟลเดอร์อีกครั้ง (ใน File Explorer คลิกขวาที่ไฟล์ > "คัดลอกเป็นเส้นทาง" แล้ววางได้)'); process.exit(1); }
  if (!aiConfig().configured) { console.log('ยังไม่ได้ตั้ง AI_API_KEY ใน backend\\.env'); process.exit(1); }
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : null;
  if (!mime) { console.log('รองรับเฉพาะ .jpg .jpeg .png'); process.exit(1); }
  const dataUrl = `data:image/${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  const kb = dataUrl.length * 0.75 / 1024;
  console.log(`ขนาดรูป ${kb.toFixed(0)} KB (ในแอพ หน้าเว็บจะย่อให้ด้านยาวไม่เกิน 1,800 พิกเซลและไม่เกิน ~1.8MB ก่อนส่ง)`);
  if (kb > 1800) console.log('คำเตือน: รูปนี้ใหญ่กว่าที่แอพส่งจริง เครื่องมือนี้ส่งไฟล์ต้นฉบับโดยไม่ย่อ อาจช้าหรือหมดเวลา ถ้าเป็นเช่นนั้นให้ลองในแอพ (ย่อรูปให้อัตโนมัติ) หรือย่อรูปก่อน (เช่น เปิดด้วยโปรแกรม Photos แล้วเลือก Resize)');
  const t0 = Date.now();
  const tick = setInterval(() => process.stdout.write('.'), 2000); // แสดงจุดระหว่างรอ ว่ายังทำงานอยู่
  process.on('exit', () => clearInterval(tick));
  try {
    if (ocrOnly) {
      const o = await ocrImage(dataUrl);
      clearInterval(tick);
      console.log(`\n--- ข้อความที่โมเดล OCR (${o.model}) อ่านได้ (${((Date.now() - t0) / 1000).toFixed(1)} วินาที) ---\n${o.text}\n---`);
      return;
    }
    const categories = DEFAULT_CATEGORIES.map((name, i) => ({ id: `c${i}`, name, type: 'expense' }));
    const r = await parseReceiptWithAi(dataUrl, { categories });
    console.log(`\nOCR ${(r.ocrMs / 1000).toFixed(1)} วินาที | รวม ${(r.latencyMs / 1000).toFixed(1)} วินาที | ปิดข้อมูลส่วนตัว ${r.redactions} จุด`);
    console.log('\n--- ผลที่ระบบจะเติมในหน้ายืนยัน ---');
    console.log(JSON.stringify(r.item, null, 2));
    console.log('\n--- ใบเสร็จ ---');
    console.log(JSON.stringify(r.receipt, null, 2));
  } catch (e) {
    console.log(`\nล้มเหลว หลังรอ ${((Date.now() - t0) / 1000).toFixed(1)} วินาที:`, e.code || '', e.message);
    process.exit(1);
  }
})();
