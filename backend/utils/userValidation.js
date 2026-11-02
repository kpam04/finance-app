// ฟังก์ชันตรวจข้อมูลผู้ใช้ (ใช้ร่วมกันใน register / profile / สคริปต์ย้ายข้อมูล)
// ทุกฟังก์ชันคืน { value } เมื่อผ่าน หรือ { error } เมื่อไม่ผ่าน

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const NICK_RE = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'-]*$/u;
const byteLength = (s) => Buffer.byteLength(s, 'utf8');

const cleanText = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();

// แยกชื่อเต็มที่ช่องว่างแรก: "สมชาย ใจดี มาก" -> ชื่อ "สมชาย", นามสกุล "ใจดี มาก"
function splitFullName(full) {
  const t = cleanText(full);
  if (!t) return { firstName: '', lastName: '' };
  const i = t.indexOf(' ');
  return i === -1
    ? { firstName: t, lastName: '' }
    : { firstName: t.slice(0, i), lastName: t.slice(i + 1).trim() };
}

function checkName(value, label, { required = true, max = 50 } = {}) {
  const v = cleanText(value);
  if (!v) return required ? { error: `กรุณากรอก${label}` } : { value: '' };
  if (v.length > max) return { error: `${label}ต้องไม่เกิน ${max} ตัวอักษร` };
  if (!NAME_RE.test(v)) return { error: `${label}ต้องเป็นตัวอักษรเท่านั้น` };
  return { value: v };
}

function checkNickname(value) {
  const v = cleanText(value);
  if (!v) return { value: '' };
  if (v.length > 30) return { error: 'ชื่อเล่นต้องไม่เกิน 30 ตัวอักษร' };
  if (!NICK_RE.test(v)) return { error: 'ชื่อเล่นมีอักขระที่ไม่อนุญาต' };
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

function checkPhone(value) {
  const raw = cleanText(value);
  if (!raw) return { value: '' };
  const v = raw.replace(/[\s-]/g, '');
  if (!/^\+?\d{9,15}$/.test(v)) return { error: 'เบอร์โทรไม่ถูกต้อง' };
  return { value: v };
}

function checkBirthDate(value, now = new Date()) {
  const s = cleanText(value);
  if (!s) return { value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: 'รูปแบบวันเกิดไม่ถูกต้อง' };
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900) {
    return { error: 'วันเกิดไม่ถูกต้อง' };
  }
  if (dt > now) return { error: 'วันเกิดต้องไม่เป็นวันในอนาคต' };
  return { value: dt };
}

function checkOccupation(value) {
  const v = cleanText(value);
  if (v.length > 100) return { error: 'อาชีพต้องไม่เกิน 100 ตัวอักษร' };
  return { value: v };
}

function checkIncome(value) {
  if (value === '' || value === null || value === undefined) return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: 'รายได้ต่อเดือนไม่ถูกต้อง' };
  return { value: Math.round(n * 100) / 100 };
}

function checkCurrency(value) {
  const v = cleanText(value).toUpperCase();
  if (!v) return { value: 'THB' };
  if (!/^[A-Z]{3}$/.test(v)) return { error: 'รหัสสกุลเงินต้องเป็นตัวอักษร 3 ตัว เช่น THB' };
  return { value: v };
}

module.exports = {
  cleanText, splitFullName, checkName, checkNickname, checkEmail, checkSignupEmail, ALLOWED_EMAIL_DOMAINS, checkPassword,
  checkPhone, checkBirthDate, checkOccupation, checkIncome, checkCurrency,
};
