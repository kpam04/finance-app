// แปลง "เลขที่เป็นคำไทย" ในข้อความเป็นตัวเลข เช่น "ค่ากาแฟหกสิบห้าบาท" -> "ค่ากาแฟ 65 บาท"
// ใช้กับข้อความที่ได้จากการพูด (เบราว์เซอร์อาจถอดเสียงเป็นคำแทนตัวเลข) ทำก่อนอ่านวันที่และจำนวนเงิน
//
// หลักการกันแปลงผิด (เพราะคำไทยจำนวนมากมีเสียงเลขซ่อนอยู่ เช่น ห้างสรรพสินค้า เก้าอี้ สามล้อ ยี่ห้อ):
//  1) แปลงเฉพาะ "กลุ่มคำเลข" ที่เป็นจำนวนถูกไวยากรณ์ (เช่น หกสิบห้า ร้อยยี่สิบ สองหมื่นห้า) ที่ไม่ถูกต้องปล่อยไว้ตามเดิม
//  2) กลุ่มคำเลขต้องเริ่มและจบตรงขอบคำจากตัวตัดคำภาษาไทยของเบราว์เซอร์ (Intl.Segmenter) ถ้ามี
//  3) มีรายการคำที่ห้ามแปลง (PROTECTED) ใช้ทั้งกรณีมีและไม่มีตัวตัดคำ
// กรณีคลุมเครือ (เช่น "สองสามร้อย") ไม่แปลง ให้ผู้ใช้แก้ในหน้ายืนยัน

const DIGITS = { ศูนย์: 0, หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const UNITS = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 10000, แสน: 100000, ล้าน: 1000000 };
const SPECIAL = ['เอ็ด', 'ยี่', 'จุด'];
const WORDS = [...Object.keys(DIGITS), ...Object.keys(UNITS), ...SPECIAL].sort((a, b) => b.length - a.length);
const WORD_RE = new RegExp(WORDS.join('|'), 'g');
const RUN_SRC = `(?:${WORDS.join('|')})+`;

// คำปกติที่มีเสียงเลขซ่อนอยู่ ห้ามแปลงช่วงที่ทับซ้อนกับคำเหล่านี้
const PROTECTED = [
  'ห้างสรรพสินค้า', 'ห้าง', 'ห้าม', 'ห้าแยก', 'เก้าอี้', 'สามล้อ', 'สิบล้อ', 'สี่แยก', 'สามแยก', 'หกล้ม',
  'แปดริ้ว', 'แปดเปื้อน', 'ร้อยแก้ว', 'ร้อยละ', 'สองแถว', 'สามัคคี', 'สามัญ', 'สามี', 'สามารถ',
  'สามเหลี่ยม', 'สี่เหลี่ยม', 'ยี่ห้อ', 'พันธุ์', 'พันธนาการ', 'พันทิป', 'แสนสาหัส', 'แสนดี', 'แสนสุข',
  'ล้านนา', 'หนึ่งเดียว', 'จุดประสงค์', 'จุดหมาย', 'สองฝั่ง',
];

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

// จำนวนเต็มส่วนที่ไม่เกินหลักแสน (ไม่มี "ล้าน") คืน null ถ้าไวยากรณ์ผิด
function parseBelowMillion(tokens) {
  let total = 0;
  let pending = null; // เลขโดดที่รอหน่วย
  let lastUnit = Infinity;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in DIGITS) {
      if (pending !== null) return null; // เลขโดดสองตัวติดกัน (เช่น "หนึ่งสอง") ไม่ใช่จำนวน
      pending = DIGITS[t];
    } else if (t === 'ยี่') {
      if (pending !== null || tokens[i + 1] !== 'สิบ') return null; // "ยี่" ใช้ได้เฉพาะหน้า "สิบ"
      pending = 2;
    } else if (t === 'เอ็ด') {
      if (pending !== null || i !== tokens.length - 1 || lastUnit === Infinity) return null; // "เอ็ด" ต้องอยู่ท้ายสุดต่อจากหน่วย
      pending = 'E';
    } else if (t in UNITS) {
      const u = UNITS[t];
      if (u >= lastUnit || pending === 'E') return null; // หน่วยต้องเรียงจากมากไปน้อย
      total += (pending === null ? 1 : pending) * u;
      pending = null;
      lastUnit = u;
    } else {
      return null;
    }
  }
  if (pending === null) return lastUnit === Infinity ? null : total;
  if (pending === 'E') return total + 1; // สิบเอ็ด = 11, ร้อยเอ็ด = 101
  if (lastUnit === Infinity) return pending; // เลขโดดเดี่ยว
  if (lastUnit <= 100) return total + pending; // ตามไวยากรณ์: สิบห้า = 15, ร้อยห้า = 105 (ถ้าหมายถึง 150 ให้พูด "ร้อยห้าสิบ")
  return total + pending * (lastUnit / 10); // ภาษาพูดตั้งแต่หลักพันขึ้นไป: สองพันห้า = 2,500, สองหมื่นห้า = 25,000, ล้านห้า = 1,500,000
}

function parseWhole(tokens) {
  if (tokens.length === 0) return null;
  const idx = tokens.lastIndexOf('ล้าน');
  if (idx === -1) return parseBelowMillion(tokens);
  const left = tokens.slice(0, idx);
  const right = tokens.slice(idx + 1);
  const l = left.length ? parseWhole(left) : 1;
  if (l === null) return null;
  let r = 0;
  if (right.length === 1 && right[0] in DIGITS && right[0] !== 'ศูนย์') r = DIGITS[right[0]] * 100000; // ล้านห้า = 1,500,000
  else if (right.length > 0) {
    r = parseBelowMillion(right);
    if (r === null) return null;
  }
  return l * 1000000 + r;
}

// แปลงกลุ่มคำเลขหนึ่งกลุ่ม (สตริง) เป็นข้อความตัวเลข คืน null ถ้าไม่ใช่จำนวนที่ถูกต้อง
export function parseThaiNumberWords(run) {
  const tokens = run.match(WORD_RE) || [];
  if (tokens.join('') !== run) return null;
  const dot = tokens.indexOf('จุด');
  let value;
  if (dot === -1) {
    value = parseWhole(tokens);
    if (value === null || value > 1e12) return null;
    return String(value);
  }
  if (dot !== tokens.lastIndexOf('จุด') || dot === 0 || dot === tokens.length - 1) return null;
  const whole = parseWhole(tokens.slice(0, dot));
  const frac = tokens.slice(dot + 1);
  if (whole === null || whole > 1e12 || !frac.every((t) => t in DIGITS)) return null;
  return `${whole}.${frac.map((t) => DIGITS[t]).join('')}`;
}

function wordBoundaries(text) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  try {
    const set = new Set([0, text.length]);
    for (const s of new Intl.Segmenter('th', { granularity: 'word' }).segment(text)) {
      set.add(s.index);
      set.add(s.index + s.segment.length);
    }
    return set;
  } catch {
    return null;
  }
}

function protectedRanges(text) {
  const ranges = [];
  for (const w of PROTECTED) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(w, from);
      if (i === -1) break;
      ranges.push([i, i + w.length]);
      from = i + 1;
    }
  }
  return ranges;
}

/**
 * แปลงเลขคำไทยทั้งข้อความ (และเลขไทย ๐-๙) เป็นตัวเลขอารบิก
 * "เมื่อวานค่ากาแฟหกสิบห้าบาท" -> "เมื่อวานค่ากาแฟ 65 บาท"
 */
export function normalizeThaiNumbers(input) {
  let text = String(input === undefined || input === null ? '' : input);
  if (!text) return '';
  text = text.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));

  const masked = protectedRanges(text);
  const bounds = wordBoundaries(text);
  const re = new RegExp(RUN_SRC, 'g');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (masked.some(([a, b]) => start < b && end > a)) continue;
    if (m[0] === 'ร้อยเอ็ด') continue; // "ร้อยเอ็ด" ลอย ๆ (ไม่มีเลขนำหน้า) มักเป็นชื่อจังหวัด ไม่ใช่ 101 ("หนึ่งร้อยเอ็ด" แปลงได้ตามปกติ)
    if (bounds && !(bounds.has(start) && bounds.has(end))) continue;
    const value = parseThaiNumberWords(m[0]);
    if (value === null) continue;
    out += `${text.slice(last, start)} ${value} `;
    last = end;
  }
  out += text.slice(last);
  return out.replace(/\s+/g, ' ').trim();
}
