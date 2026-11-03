// ย่อรูปที่ผู้ใช้เลือกให้เป็นสี่เหลี่ยมจัตุรัส (ครอบตรงกลาง) แล้วแปลงเป็น data URL แบบ JPEG ก่อนส่งไปเก็บเป็นรูปโปรไฟล์
// - รับไฟล์ JPG/PNG/WebP ไม่เกิน 5MB (ต้นฉบับ) / ผลลัพธ์ 256x256 ราว 20-40KB (หลังบ้านรับไม่เกิน 60KB)
// - PNG ที่มีพื้นโปร่งใสจะถูกวางบนพื้นขาว (JPEG ไม่มีความโปร่งใส)
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_INPUT = 5 * 1024 * 1024;
// ความยาว data URL สูงสุดที่ยอมส่ง (ถอดรหัสแล้วประมาณ 57KB ต่ำกว่าเพดาน 60KB ของหลังบ้านและเพดาน 100KB ของคำขอ)
export const AVATAR_MAX_CHARS = 78000;
// ลำดับที่ลองถ้ารูปยังใหญ่เกิน: (ขนาดด้าน, คุณภาพ)
const ATTEMPTS = [[256, 0.85], [256, 0.72], [224, 0.7], [192, 0.65], [160, 0.6]];

const OPEN_ERROR = 'เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น';

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

export async function resizeImageToSquare(file) {
  if (!file || !AVATAR_TYPES.includes(file.type)) throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
  if (file.size > AVATAR_MAX_INPUT) throw new Error('ไฟล์ใหญ่เกินไป (ไม่เกิน 5MB)');

  const { img, url } = await loadImage(file);
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error(OPEN_ERROR);
    const side = Math.min(w, h); // ครอบเป็นสี่เหลี่ยมจัตุรัสตรงกลาง
    const sx = Math.round((w - side) / 2);
    const sy = Math.round((h - side) / 2);

    let last = '';
    for (const [out, quality] of ATTEMPTS) {
      const canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้ ลองใช้ Chrome หรือ Edge');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out, out);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      last = canvas.toDataURL('image/jpeg', quality);
      if (last.length <= AVATAR_MAX_CHARS) return last;
    }
    throw new Error('รูปนี้ยังใหญ่เกินไปหลังย่อ ลองเลือกรูปอื่น');
  } finally {
    URL.revokeObjectURL(url);
  }
}
