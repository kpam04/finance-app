// ตรวจรูปที่หน้าเว็บส่งมา (ย่อและแปลงเป็น JPEG แล้ว): ชนิดจริงจากไบต์แรก ขนาด และรูปแบบ data URL ไม่เก็บและไม่บันทึกเนื้อหาของรูป
const IMG_RE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_RECEIPT_BYTES = 1800 * 1024; // หลังถอดรหัสไม่เกิน ~1.8MB (หน้าเว็บย่อให้อยู่ในขนาดนี้)

function checkReceiptImage(value) {
  if (typeof value !== 'string' || !value) return { error: 'กรุณาเลือกรูปใบเสร็จ' };
  const m = IMG_RE.exec(value);
  if (!m || m[2].length % 4 !== 0) return { error: 'รูปต้องเป็นไฟล์ JPG หรือ PNG' };
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 200) return { error: 'ไฟล์รูปไม่ถูกต้อง' };
  if (buf.length > MAX_RECEIPT_BYTES) return { error: 'รูปใหญ่เกินไป (หลังย่อไม่เกิน 1.8MB) ลองถ่ายหรือเลือกรูปใหม่' };
  const okMagic = m[1] === 'jpeg' ? buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff : buf.subarray(0, 8).equals(PNG_MAGIC);
  if (!okMagic) return { error: 'ไฟล์รูปไม่ถูกต้อง (ชนิดไฟล์ไม่ตรงกับเนื้อหา)' };
  return { value, bytes: buf.length };
}

module.exports = { checkReceiptImage, MAX_RECEIPT_BYTES };
