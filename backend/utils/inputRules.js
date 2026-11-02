// กติกาตรวจข้อมูลที่รับจากผู้ใช้ ใช้ร่วมกันทุก route (จำนวนเงิน โน้ต วันที่ ชื่อหมวด สี)
// ทุกฟังก์ชันคืน { value } เมื่อผ่าน หรือ { error: 'ข้อความภาษาไทย' } เมื่อไม่ผ่าน

const MAX_AMOUNT = 100000000; // เพดานจำนวนเงินต่อรายการ 100 ล้านบาท
const MAX_NOTE = 200;
const MAX_CATEGORY_NAME = 40;
const MAX_USER_CATEGORIES = 30; // หมวดที่ผู้ใช้สร้างเองได้สูงสุดต่อคน
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const len = (s) => Array.from(s).length; // นับเป็นตัวอักษรจริง (ไม่ใช่หน่วยโค้ด)

// จำนวนเงิน: ต้องเป็นตัวเลขจำกัด 0.01 ถึง MAX_AMOUNT ปัดเป็น 2 ตำแหน่ง (รับเลขหรือข้อความที่เป็นตัวเลข)
function parseAmount(raw, label = 'จำนวนเงิน') {
  // ข้อความต้องเป็นเลขฐานสิบล้วน เช่น "65" หรือ "1250.50" (ไม่รับ 0x10, 1e9, Infinity)
  if (typeof raw === 'string' && !/^\s*\d+(\.\d+)?\s*$/.test(raw)) return { error: `${label}ไม่ถูกต้อง` };
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return { error: `${label}ไม่ถูกต้อง` };
  const v = Math.round(n * 100) / 100;
  if (v < 0.01) return { error: `${label}ไม่ถูกต้อง` };
  if (v > MAX_AMOUNT) return { error: `${label}ต้องไม่เกิน ${MAX_AMOUNT.toLocaleString('en-US')} บาท` };
  return { value: v };
}

// บันทึกช่วยจำ: ว่างได้ ไม่เกิน MAX_NOTE ตัวอักษร
function cleanNote(raw) {
  if (raw !== undefined && raw !== null && typeof raw !== 'string' && typeof raw !== 'number') {
    return { error: 'บันทึกช่วยจำไม่ถูกต้อง' };
  }
  const s = String(raw === undefined || raw === null ? '' : raw).trim();
  if (len(s) > MAX_NOTE) return { error: `บันทึกช่วยจำต้องไม่เกิน ${MAX_NOTE} ตัวอักษร` };
  return { value: s };
}

// วันที่ (ชนิด Date) ต้องอยู่ในปี 2000-2100
function yearInRange(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

// ชื่อหมวดหมู่: ข้อความ 1-40 ตัวอักษร ไม่มีอักขระควบคุม (ยุบช่องว่างซ้อนให้เหลือหนึ่งช่อง)
function cleanCategoryName(raw) {
  if (typeof raw !== 'string') return { error: 'ชื่อหมวดหมู่ไม่ถูกต้อง' };
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return { error: 'กรุณากรอกชื่อหมวดหมู่' };
  if (len(s) > MAX_CATEGORY_NAME) return { error: `ชื่อหมวดหมู่ต้องไม่เกิน ${MAX_CATEGORY_NAME} ตัวอักษร` };
  if (Array.from(s).some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    return { error: 'ชื่อหมวดหมู่มีอักขระที่ไม่อนุญาต' };
  }
  return { value: s };
}

// สี: รูปแบบ #RRGGBB เท่านั้น (ไม่ส่งมาใช้ค่าเริ่มต้น)
function cleanColor(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: '#6366f1' };
  if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw)) return { error: 'สีต้องเป็นรูปแบบ #RRGGBB' };
  return { value: raw.toLowerCase() };
}

// ไอคอน: ข้อความสั้นไม่เกิน 30 ตัวอักษร (ไม่ส่งมาใช้ 'tag')
function cleanIcon(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: 'tag' };
  if (typeof raw !== 'string' || len(raw) > 30) return { error: 'ไอคอนไม่ถูกต้อง' };
  return { value: raw };
}

module.exports = {
  MAX_AMOUNT, MAX_NOTE, MAX_CATEGORY_NAME, MAX_USER_CATEGORIES,
  parseAmount, cleanNote, yearInRange, cleanCategoryName, cleanColor, cleanIcon,
};
