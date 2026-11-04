// เตรียมรูปใบเสร็จก่อนส่งให้ AI อ่าน: ย่อให้ด้านยาวไม่เกิน 1,800 พิกเซล แล้วแปลงเป็น JPEG ใหม่
// (การวาดลงผืนผ้าใบใหม่ทำให้ข้อมูลตำแหน่ง GPS/EXIF ที่ติดมากับรูปหายไป) และทำภาพย่อไว้แสดงเทียบในหน้ายืนยัน
// รับไฟล์จากกล้องมือถือหรือไฟล์ในเครื่อง ไม่เก็บอะไรไว้ที่ใด
export const RECEIPT_MAX_FILE = 25 * 1024 * 1024; // ไฟล์ต้นฉบับไม่เกิน 25MB
export const RECEIPT_MAX_CHARS = 2400000; // ความยาว data URL ที่ยอมส่ง (ถอดรหัสแล้วราว 1.8MB ตรงกับเพดานหลังบ้าน)
const ATTEMPTS = [[1800, 0.85], [1600, 0.8], [1400, 0.75], [1200, 0.7], [1000, 0.65]];
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

function draw(img, w, h, side, quality) {
  const scale = Math.min(1, side / Math.max(w, h));
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
      main = draw(img, w, h, side, quality);
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
