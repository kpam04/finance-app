import { enhanceReceiptPixels } from './receiptEnhance.js';

// เตรียมรูปใบเสร็จก่อนส่งให้ AI อ่าน: ขยายรูปเล็ก/ย่อรูปใหญ่ (ด้านยาวไม่เกิน 2,400 พิกเซล) ปรับขาวดำให้อ่านง่าย แล้วแปลงเป็น JPEG ใหม่
// (การวาดลงผืนผ้าใบใหม่ทำให้ข้อมูลตำแหน่ง GPS/EXIF ที่ติดมากับรูปหายไป) และทำภาพย่อไว้แสดงเทียบในหน้ายืนยัน
// รับไฟล์จากกล้องมือถือหรือไฟล์ในเครื่อง ไม่เก็บอะไรไว้ที่ใด
export const RECEIPT_MAX_FILE = 25 * 1024 * 1024; // ไฟล์ต้นฉบับไม่เกิน 25MB
export const RECEIPT_MAX_CHARS = 2400000; // ความยาว data URL ที่ยอมส่ง (ถอดรหัสแล้วราว 1.8MB ตรงกับเพดานหลังบ้าน)
const ATTEMPTS = [[2400, 0.85], [2000, 0.82], [1800, 0.8], [1600, 0.75], [1400, 0.7], [1200, 0.65], [1000, 0.6]];
// รูปเล็ก (เช่น screenshot ใบเสร็จจากแอป กว้าง ~360 พิกเซล) ตัวหนังสือเล็กเกินให้ OCR อ่าน: ขยายให้ด้านสั้นราว 1,200 พิกเซล (ไม่เกิน 4 เท่า)
const MIN_SHORT_SIDE = 1200;
const MAX_UPSCALE = 4;
const THUMB_SIDE = 720;

const OPEN_ERROR = 'เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น (ถ้าเป็นไฟล์ HEIC ให้ถ่ายใหม่เป็น JPG หรือแปลงไฟล์ก่อน)';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(OPEN_ERROR));
    };
    img.src = url;
  });
}

// enhance = ปรับขาวดำ/กลับสีพื้นเข้ม (ใช้กับรูปที่ส่งให้ OCR เท่านั้น รูปย่อในหน้ายืนยันยังเป็นสีเดิม)
function draw(img, w, h, side, quality, { enhance = false } = {}) {
  const up = enhance ? Math.min(MAX_UPSCALE, Math.max(1, MIN_SHORT_SIDE / Math.min(w, h))) : 1;
  const scale = Math.min(up, side / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้ ลองใช้ Chrome หรือ Edge');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
  if (enhance) {
    try {
      const px = ctx.getImageData(0, 0, cw, ch);
      enhanceReceiptPixels(px.data, cw, ch);
      ctx.putImageData(px, 0, 0);
    } catch {
      /* ปรับรูปไม่ได้ (เช่น เบราว์เซอร์จำกัด) ส่งรูปที่ย่อแล้วตามเดิม */
    }
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: cw, height: ch };
}

export async function prepareReceiptImage(file) {
  if (!file || !String(file.type || '').startsWith('image/') || /svg|gif/i.test(file.type)) throw new Error('กรุณาเลือกไฟล์รูปภาพ (JPG หรือ PNG)');
  if (file.size > RECEIPT_MAX_FILE) throw new Error('ไฟล์ใหญ่เกินไป (ไม่เกิน 25MB)');

  const { img, url } = await loadImage(file);
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error(OPEN_ERROR);
    let main = null;
    for (const [side, quality] of ATTEMPTS) {
      main = draw(img, w, h, side, quality, { enhance: true });
      if (main.dataUrl.length <= RECEIPT_MAX_CHARS) break;
      main = null;
    }
    if (!main) throw new Error('รูปนี้ใหญ่เกินไปแม้หลังย่อ ลองถ่ายใหม่ให้ใกล้ขึ้นหรือเลือกรูปอื่น');
    const thumb = draw(img, w, h, THUMB_SIDE, 0.7);
    return { dataUrl: main.dataUrl, thumb: thumb.dataUrl, width: main.width, height: main.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
