// ตัวช่วยวันที่/เดือนของหน้า "วางแผน" (ใช้วันที่ปฏิทินแบบเดียวกับที่เก็บในฐานข้อมูล = เที่ยงคืน UTC ของวันที่นั้น วันนี้อิงเวลาไทย)
const pad = (n) => String(n).padStart(2, '0');

const bangkokToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const monthKeyOf = (y, m) => `${y}-${pad(m)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// รับ "YYYY-MM" คืน { year, month } หรือ null
function parseMonthKey(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

// เลื่อนเดือน (delta เป็นลบได้) คืน { year, month }
function addMonths(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// เพิ่มปีตามปฏิทิน (29 ก.พ. ไปปีที่ไม่ใช่ปีอธิกสุรทิน = 28 ก.พ.)
function addYearsIso(iso, n) {
  const [y, m, day] = iso.split('-').map(Number);
  const ny = y + n;
  return `${ny}-${pad(m)}-${pad(Math.min(day, daysInMonth(ny, m)))}`;
}

const isoToUtcMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const addDaysIso = (iso, n) => new Date(isoToUtcMs(iso) + n * 86400000).toISOString().slice(0, 10);
const dayDiff = (fromIso, toIso) => Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86400000);
// รูปแบบ YYYY-MM-DD ที่เป็นวันที่จริง (เดือน 13 หรือวันที่ 45 ต้องได้ false ไม่ใช่ error)
const validIso = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

module.exports = { pad, bangkokToday, monthKeyOf, daysInMonth, parseMonthKey, addMonths, addDaysIso, addYearsIso, dayDiff, validIso, isoToUtcMs };
