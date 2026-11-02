// ตัวตรวจข้อมูลฟอร์มสมัคร/โปรไฟล์ (กติกาเดียวกับ backend: backend/utils/userValidation.js)
// ถ้าแก้กติกา ต้องแก้ทั้งสองฝั่งให้ตรงกัน ทุกฟังก์ชันคืน { value } เมื่อผ่าน หรือ { error } เมื่อไม่ผ่าน

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const cleanText = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
const byteLength = (s) => new TextEncoder().encode(s).length;

function checkName(value, label, { required = true, max = 50 } = {}) {
  const v = cleanText(value);
  if (!v) return required ? { error: `กรุณากรอก${label}` } : { value: '' };
  if (v.length > max) return { error: `${label}ต้องไม่เกิน ${max} ตัวอักษร` };
  if (!NAME_RE.test(v)) return { error: `${label}ต้องเป็นตัวอักษรเท่านั้น` };
  return { value: v };
}

function checkEmail(value) {
  const v = cleanText(value).toLowerCase();
  if (!v) return { error: 'กรุณากรอกอีเมล' };
  if (/\s/.test(v)) return { error: 'อีเมลต้องไม่มีช่องว่าง' };
  if (v.length > 254) return { error: 'อีเมลยาวเกินไป (ไม่เกิน 254 ตัวอักษร)' };

  const parts = v.split('@');
  if (parts.length < 2) return { error: 'อีเมลต้องมีเครื่องหมาย @ เช่น name@example.com' };
  if (parts.length > 2) return { error: 'อีเมลต้องมีเครื่องหมาย @ เพียงตัวเดียว' };
  const [local, domain] = parts;
  if (!local) return { error: 'กรุณากรอกชื่อก่อนเครื่องหมาย @' };
  if (!domain) return { error: 'กรุณากรอกโดเมนหลังเครื่องหมาย @ เช่น gmail.com' };
  if (/[^\x00-\x7F]/.test(v)) {
    return { error: 'อีเมลต้องใช้ตัวอักษรภาษาอังกฤษ ตัวเลข และสัญลักษณ์ . _ % + - เท่านั้น' };
  }

  if (local.length > 64) return { error: 'ส่วนหน้าเครื่องหมาย @ ยาวเกินไป (ไม่เกิน 64 ตัวอักษร)' };
  if (!/^[a-z0-9._%+-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { error: 'ส่วนหน้าเครื่องหมาย @ ไม่ถูกต้อง (ใช้ได้เฉพาะ a-z 0-9 . _ % + - ห้ามขึ้นต้นหรือลงท้ายด้วยจุด และห้ามมีจุดติดกัน)' };
  }

  const labels = domain.split('.');
  if (labels.length < 2) return { error: 'โดเมนต้องมีจุด เช่น gmail.com' };
  const labelOk = (l) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith('-') && !l.endsWith('-');
  if (!labels.every(labelOk)) {
    return { error: 'โดเมนไม่ถูกต้อง (ใช้ได้เฉพาะ a-z 0-9 - คั่นด้วยจุด ห้ามมีจุดติดกัน และห้ามขึ้นต้นหรือลงท้ายด้วย -)' };
  }
  const tld = labels[labels.length - 1];
  if (!/^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) {
    return { error: 'ส่วนท้ายโดเมนไม่ถูกต้อง เช่น .com หรือ .co.th' };
  }
  return { value: v };
}

// โดเมนอีเมลที่อนุญาตให้สมัครสมาชิก (ตรวจเฉพาะตอนสมัคร ผู้ใช้เดิมที่ใช้โดเมนอื่นยังล็อกอินได้)
const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com', 'yahoo.co.th', 'hotmail.co.th', 'proton.me'];

// ตรวจรูปแบบอีเมลก่อน แล้วจึงตรวจว่าโดเมนอยู่ในรายชื่อ (ตรงทุกตัวอักษร ไม่รับโดเมนย่อย)
function checkSignupEmail(value) {
  const r = checkEmail(value);
  if (r.error) return r;
  const domain = r.value.slice(r.value.lastIndexOf('@') + 1);
  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return { error: `สมัครได้เฉพาะอีเมลจาก ${ALLOWED_EMAIL_DOMAINS.join(', ')} เท่านั้น` };
  }
  return r;
}

// bcrypt ใช้ได้แค่ 72 ไบต์แรก (ตัวอักษรไทย 1 ตัว = 3 ไบต์) จึงจำกัดตามไบต์
function checkPassword(value, label = 'รหัสผ่าน') {
  const v = typeof value === 'string' ? value : '';
  if (Array.from(v).length < 8) return { error: `${label}ต้องมีความยาวอย่างน้อย 8 ตัวอักษร` };
  if (!v.trim()) return { error: `${label}ต้องไม่ใช่ช่องว่างล้วน` };
  if (byteLength(v) > 72) return { error: `${label}ยาวเกินไป (ไม่เกิน 72 ไบต์ หรือประมาณ 24 ตัวอักษรไทย)` };
  return { value: v };
}

// ระยะห่างระหว่างสองข้อความ (Damerau-Levenshtein แบบ OSA: นับการแก้ 1 ตัวอักษร และการสลับตำแหน่งติดกันเป็น 1)
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

// คำแนะนำเมื่อโดเมนใกล้เคียงโดเมนที่รองรับ เช่น somsri@gail.com -> somsri@gmail.com (ไม่ใกล้เคียงพอจะคืน null)
// โดเมนสั้นกว่า 9 ตัวอักษรต่างได้ไม่เกิน 1 ตัว โดเมนยาวต่างได้ไม่เกิน 2 ตัว
export function suggestEmailFix(email) {
  const v = cleanText(email).toLowerCase();
  const at = v.lastIndexOf('@');
  if (at < 1) return null;
  const domain = v.slice(at + 1);
  if (!domain || ALLOWED_EMAIL_DOMAINS.includes(domain)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const cand of ALLOWED_EMAIL_DOMAINS) {
    const dist = distance(domain, cand);
    const limit = cand.length >= 9 ? 2 : 1;
    if (dist <= limit && dist < bestDist) {
      best = cand;
      bestDist = dist;
    }
  }
  return best ? `${v.slice(0, at)}@${best}` : null;
}

export const passwordLength = (v) => Array.from(typeof v === 'string' ? v : '').length;

export { checkName, checkEmail, checkSignupEmail, checkPassword, ALLOWED_EMAIL_DOMAINS };
