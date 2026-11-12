// ตัวช่วยแสดงตัวเลข/วันที่ของหน้า "วางแผน" และการ์ดสรุปบนแดชบอร์ด
export const baht = (n) => `฿${Math.round(Number(n)).toLocaleString('th-TH')}`;

// เลขทศนิยมไม่เกิน 1 ตำแหน่ง ไม่มี .0 ท้าย
export const num1 = (n) => {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString('th-TH') : r.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// "2027-03-31" -> "31 มี.ค. 2570"
export function thaiDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "2026-11" -> "พฤศจิกายน 2569"
export function thaiMonth(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
}

// ค่าของ "ข้อเท็จจริง" ที่ใช้ในป้ายตัวเลขใต้คำแนะนำ (หน่วยบาทมี ฿ / % ที่เป็นผลเทียบมี + นำหน้าเมื่อสูงกว่า)
// % ที่เทียบกับระดับปกติ: ตั้งแต่ +100% (สองเท่าขึ้นไป) แสดงเป็น "n เท่า" อ่านง่ายกว่า (เช่น +857.7% → 9.6 เท่า)
export const timesOf = (pct) => Math.round((1 + Number(pct) / 100) * 10) / 10;
export const pctOrTimes = (pct) => (pct >= 100 ? `${num1(timesOf(pct))} เท่า` : `${pct > 0 ? '+' : ''}${num1(pct)}%`);

export function factValue(f) {
  if (typeof f.value !== 'number') return String(f.value);
  if (f.unit === '%' && /^cat\d_pct$/.test(f.id) && f.value >= 100) return `${num1(timesOf(f.value))} เท่า`;
  if (f.unit === 'บาท') return baht(f.value);
  if (f.unit === '%') return `${/_pct$/.test(f.id) && f.value > 0 ? '+' : ''}${num1(f.value)}%`;
  return `${num1(f.value)}${f.unit ? ` ${f.unit}` : ''}`;
}

// "2027-03-31" -> "มี.ค. 2570" (เดือนและปีแบบสั้น)
export function thaiMonthYearShort(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
}

// ป้ายตัวเลขใต้คำแนะนำ: [ชื่อสั้น, ค่า] เช่น ["อาหาร", "฿6,300"] ถ้าไม่มีชื่อสั้น (ข้อมูลที่เก็บไว้รุ่นเก่า) ใช้ป้ายเต็ม ชื่อสั้นว่าง = แสดงเฉพาะค่า
export function chipParts(f) {
  const short = typeof f.short === 'string' ? f.short : f.label;
  return [short, factValue(f)];
}

// ตัวเลือกเดือนที่ดูย้อนหลังได้: เดือนปัจจุบัน (รูปแบบ "YYYY-MM") และเดือนก่อนหน้ารวมทั้งหมด count เดือน เรียงจากใหม่ไปเก่า
export function monthOptions(current, count = 12) {
  const [y, m] = String(current || '').split('-').map(Number);
  if (!y || !m) return [];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = y * 12 + (m - 1) - i;
    const value = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    out.push({ value, label: thaiMonth(value) });
  }
  return out;
}
