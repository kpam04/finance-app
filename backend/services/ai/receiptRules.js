// กฎตรวจซ้ำจากข้อความ OCR (ไม่ใช้ AI): หายอดสุทธิและวันที่ในใบเสร็จด้วยรูปแบบข้อความ
// ใช้เทียบกับผลที่ LLM จัดโครงสร้างให้ ถ้าไม่ตรงกัน ระบบจะใช้ค่าจากกฎและเตือนให้ผู้ใช้ตรวจ (ตรวจสอบไขว้ระหว่างกฎกับ LLM)

// คำที่บอกยอดที่ต้องจ่ายจริง (ลำดับสำคัญสูง) และคำทั่วไปที่มักเป็นยอดรวม (ใช้เมื่อไม่พบกลุ่มแรก)
const STRONG = /ยอดสุทธิ|รวมสุทธิ|ยอดชำระ|ยอดที่ต้องชำระ|รวมทั้งสิ้น|รวมเงินที่ต้องชำระ|จำนวนเงินที่ต้องชำระ|grand\s*total|net\s*total|total\s*due|amount\s*due/i;
const WEAK = /ยอดรวม|รวมเงิน|total|รวม/i;
// บรรทัดที่มีคำเหล่านี้ไม่ใช่ยอดที่จ่าย (ภาษี เงินทอน เงินที่รับมา ส่วนลด ยอดก่อนภาษี)
const EXCLUDE = /ภาษี|vat|ทอน|change|เงินสด|cash|รับเงิน|ส่วนลด|discount|sub\s*-?\s*total|ก่อน|แต้ม|point/i;
// ตัวเลขจำนวนเงิน (1,408.75 / 192.25 / 90) ไม่นับตัวเลขที่ตามด้วยหน่วยนับ เช่น "4 ชิ้น"
const NUM = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,.]*\d)(?!\s*(?:ชิ้น|รายการ|อัน|ขวด|pcs|items?|%))/gi;

const toNumber = (intPart, dec) => Number(`${intPart.replace(/,/g, '')}${dec || ''}`);

function lineAmounts(line) {
  const out = [];
  for (const m of line.matchAll(NUM)) {
    const v = toNumber(m[1], m[2]);
    if (Number.isFinite(v) && v > 0 && v < 10000000) out.push(Math.round(v * 100) / 100);
  }
  return out;
}

// คืน { best, candidates } best = ยอดที่น่าจะจ่ายจริง (null ถ้าหาไม่เจอ) candidates = ยอดทั้งหมดที่พบในบรรทัดคำสำคัญ
function extractTotals(text) {
  const strong = [];
  const weak = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/[*_#|]/g, ' ');
    if (EXCLUDE.test(line)) continue;
    const isStrong = STRONG.test(line);
    if (!isStrong && !WEAK.test(line)) continue;
    const nums = lineAmounts(line);
    if (!nums.length) continue;
    (isStrong ? strong : weak).push(nums[nums.length - 1]); // ตัวเลขสุดท้ายของบรรทัด (ยอดมักอยู่ขวาสุด)
  }
  const pool = strong.length ? strong : weak;
  if (!pool.length) return { best: null, candidates: [] };
  // ใช้ค่าที่พบบ่อยที่สุด ถ้าเท่ากันใช้ค่าที่อยู่ท้ายสุด
  const count = new Map();
  for (const v of pool) count.set(v, (count.get(v) || 0) + 1);
  let best = pool[pool.length - 1];
  for (const v of pool) if (count.get(v) > count.get(best)) best = v;
  return { best, candidates: [...new Set([...strong, ...weak])] };
}

const TH_MONTHS = [
  ['ม.ค.', 'มกราคม', 'มกรา'], ['ก.พ.', 'กุมภาพันธ์', 'กุมภา'], ['มี.ค.', 'มีนาคม', 'มีนา'], ['เม.ย.', 'เมษายน', 'เมษา'],
  ['พ.ค.', 'พฤษภาคม', 'พฤษภา'], ['มิ.ย.', 'มิถุนายน', 'มิถุนา'], ['ก.ค.', 'กรกฎาคม', 'กรกฎา'], ['ส.ค.', 'สิงหาคม', 'สิงหา'],
  ['ก.ย.', 'กันยายน', 'กันยา'], ['ต.ค.', 'ตุลาคม', 'ตุลา'], ['พ.ย.', 'พฤศจิกายน', 'พฤศจิกา'], ['ธ.ค.', 'ธันวาคม', 'ธันวา'],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_ALT = TH_MONTHS.flat().sort((a, b) => b.length - a.length).map(esc).join('|');
const monthIndex = (word) => TH_MONTHS.findIndex((names) => names.includes(word)) + 1;

const pad = (n) => String(n).padStart(2, '0');
const addDaysIso = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// ปีในใบเสร็จไทย: 2 หลัก >= 40 = พ.ศ. (69 = 2569 = 2026) น้อยกว่านั้น = ค.ศ. (26 = 2026) / 4 หลัก >= 2400 = พ.ศ.
function toYear(y) {
  const n = Number(y);
  if (y.length === 2) return n >= 40 ? { year: 1957 + n, be: true } : { year: 2000 + n, be: false };
  return n >= 2400 ? { year: n - 543, be: true } : { year: n, be: false };
}

function makeIso(d, m, yRaw, today) {
  const { year, be } = toYear(yRaw);
  const iso = `${year}-${pad(m)}-${pad(d)}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return null;
  if (iso > addDaysIso(today, 1) || iso < addDaysIso(today, -800)) return null;
  return { iso, be };
}

// คืนวันที่ทั้งหมดที่พบ (เรียงตามที่ปรากฏ ไม่ซ้ำ) [{ iso, be }]
function extractDates(text, today) {
  const s = String(text || '');
  const found = [];
  const push = (r, index) => { if (r) found.push({ ...r, index }); };
  for (const m of s.matchAll(/(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/g)) push(makeIso(Number(m[1]), Number(m[2]), m[3], today), m.index);
  for (const m of s.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${MONTH_ALT})\\s*(\\d{4}|\\d{2})(?!\\d)`, 'g'))) push(makeIso(Number(m[1]), monthIndex(m[2]), m[3], today), m.index);
  for (const m of s.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) push(makeIso(Number(m[3]), Number(m[2]), m[1], today), m.index);
  found.sort((a, b) => a.index - b.index);
  const seen = new Set();
  return found.filter((x) => (seen.has(x.iso) ? false : seen.add(x.iso))).map(({ iso, be }) => ({ iso, be }));
}

module.exports = { extractTotals, extractDates };
