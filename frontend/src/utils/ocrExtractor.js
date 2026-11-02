import { autoCategorize } from './autoCategorize.js';

/**
 * สแกนใบเสร็จ/สลิป — เวอร์ชันสาธิต (จำลอง)
 * ยังไม่ได้อ่านตัวอักษรในรูปจริง แต่เดาจาก "ชื่อไฟล์" แล้วใส่ค่าตัวอย่างให้
 * ร่างที่ได้จะมี is_simulated = true เพื่อให้หน้ายืนยันเตือนผู้ใช้ให้ตรวจสอบเอง
 * (ถ้าต้องการอ่านจริง ให้เปลี่ยนฟังก์ชันนี้ไปใช้ OCR เช่น Tesseract.js)
 */
export async function parseReceiptImage(imageFile, categories = []) {
  const imageUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
    reader.readAsDataURL(imageFile);
  });

  const name = (imageFile.name || '').toLowerCase();
  const has = (...words) => words.some((w) => name.includes(w));

  let type = 'expense';
  let merchant = `ใบเสร็จ (${imageFile.name})`;
  let amount = 250;
  let categoryName = 'อาหาร';

  if (has('salary', 'เงินเดือน')) {
    type = 'income'; merchant = 'รับโอนเงินเดือนเข้าบัญชี'; amount = 38000; categoryName = 'เงินเดือน';
  } else if (has('bonus', 'โบนัส')) {
    type = 'income'; merchant = 'เงินโบนัส'; amount = 15000; categoryName = 'ของขวัญ/โบนัส';
  } else if (has('receive', 'income', 'deposit', 'โอนเข้า', 'รับโอน', 'เงินเข้า')) {
    type = 'income'; merchant = `สลิปรับโอนเงินเข้า (${imageFile.name})`; amount = 2500; categoryName = 'รายได้เสริม';
  } else if (has('7-11', 'seven', '7eleven')) {
    merchant = '7-Eleven'; amount = 145; categoryName = 'อาหาร';
  } else if (has('cafe', 'coffee', 'amazon', 'starbucks')) {
    merchant = 'ร้านกาแฟ'; amount = 65; categoryName = 'อาหาร';
  } else if (has('ptt', 'oil', 'gas', 'shell')) {
    merchant = 'สถานีบริการน้ำมัน'; amount = 900; categoryName = 'เดินทาง';
  } else if (has('lotus', 'bigc', 'market')) {
    merchant = 'ซูเปอร์มาร์เก็ต'; amount = 850.5; categoryName = 'อาหาร';
  }

  const categoryId = autoCategorize(categoryName, categories, type) || '';
  const cat = categories.find((c) => c.category_id === categoryId);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return {
    type,
    amount,
    category_id: categoryId,
    category_name: cat ? cat.name : type === 'income' ? 'รายรับ' : 'รายจ่าย',
    note: merchant,
    transaction_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    image_url: imageUrl,
    is_simulated: true,
    confidence: 'medium',
  };
}
