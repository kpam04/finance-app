import { autoCategorize, matchCategoryByKeyword } from './autoCategorize.js';

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MONTH_MAP = {
  'ม.ค.': 1, 'มกราคม': 1, 'มกรา': 1,
  'ก.พ.': 2, 'กุมภาพันธ์': 2, 'กุมภา': 2,
  'มี.ค.': 3, 'มีนาคม': 3, 'มีนา': 3,
  'เม.ย.': 4, 'เมษายน': 4, 'เมษา': 4,
  'พ.ค.': 5, 'พฤษภาคม': 5, 'พฤษภา': 5,
  'มิ.ย.': 6, 'มิถุนายน': 6, 'มิถุนา': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'กรกฎา': 7,
  'ส.ค.': 8, 'สิงหาคม': 8, 'สิงหา': 8,
  'ก.ย.': 9, 'กันยายน': 9, 'กันยา': 9,
  'ต.ค.': 10, 'ตุลาคม': 10, 'ตุลา': 10,
  'พ.ย.': 11, 'พฤศจิกายน': 11, 'พฤศจิกา': 11,
  'ธ.ค.': 12, 'ธันวาคม': 12, 'ธันวา': 12,
};
// เรียงจากคำยาวไปสั้น เพื่อให้ "มกราคม" ถูกจับก่อน "มกรา"
const MONTH_REGEX_SRC = Object.keys(MONTH_MAP)
  .sort((a, b) => b.length - a.length)
  .map(esc)
  .join('|');

// ปี: >2400 = พ.ศ., สองหลัก >=50 = พ.ศ.ย่อ (69 -> 2569), น้อยกว่านั้น = ค.ศ.ย่อ (26 -> 2026)
function normalizeYear(y) {
  if (y > 2400) return y - 543;
  if (y < 100) return y >= 50 ? y + 1957 : y + 2000;
  return y;
}

// ---------- วลีบอกวันที่ย้อนหลัง ----------
const WEEKDAYS = { 'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัสบดี': 4, 'พฤหัส': 4, 'ศุกร์': 5, 'เสาร์': 6 };
const WEEKDAY_SRC = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
// "ที่แล้ว" / "ที่ผ่านมา" / "ผ่านมา" / "ก่อน" / "ที่ก่อน" / "ก่อนหน้า"
const PAST_SRC = '(?:ที่\\s*)?(?:แล้ว|ผ่านมา|ก่อน(?:หน้า)?)';
const MAX_DAYS = 366;
const MAX_WEEKS = 52;
const MAX_MONTHS = 24;

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
};

// วันนั้นของสัปดาห์ "ล่าสุดที่ผ่านไปแล้ว" นับจากเมื่อวานย้อนไป (ไม่นับวันนี้) เช่น วันนี้ศุกร์ "วันศุกร์ที่แล้ว" = 7 วันก่อน
function lastWeekday(today, dow) {
  let back = (today.getDay() - dow + 7) % 7;
  if (back === 0) back = 7;
  return addDays(today, back);
}

// เดือนที่ผ่านมา N เดือน: วันที่เดียวกันของเดือนนั้น (ถ้าเดือนนั้นไม่มีวันนั้น ใช้วันสุดท้ายของเดือน)
function monthsAgo(today, n) {
  const first = new Date(today.getFullYear(), today.getMonth() - n, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return { date: new Date(first.getFullYear(), first.getMonth(), Math.min(today.getDate(), lastDay)), year: first.getFullYear(), month: first.getMonth() };
}

// ตัดส่วนตัวเลข (และ "เมื่อ") หน้าคำออก เหลือวลีเปล่า (เช่น "สัปดาห์ที่แล้ว") นับเป็น 1 หน่วย
function bareMatch(m, word, baseIndex) {
  const off = m[0].indexOf(word);
  return { n: 1, matched: m[0].slice(off), start: baseIndex + off, hadNumber: false };
}

// เลือกว่าตัวเลขหน้าวลี (เช่น "2 สัปดาห์ที่แล้ว") เป็นจำนวนหน่วย หรือเป็นจำนวนเงินที่บังเอิญอยู่ติดกัน
//  - ไม่มีตัวเลข = 1 หน่วย
//  - ตัวเลขเกินเพดาน หรือ (มากกว่า 12 และไม่มีตัวเลขอื่นในข้อความ) = ถือเป็นจำนวนเงิน ใช้วลีเปล่า 1 หน่วย
//    เช่น "ค่ากาแฟ 65 สัปดาห์ที่แล้ว" ได้ 1 สัปดาห์ จำนวนเงิน 65
function pickCount(text, m, max) {
  if (m[1] === undefined) return { n: 1, matched: m[0], start: m.index, hadNumber: false };
  const n = parseInt(m[1], 10);
  if (n < 1) return null; // "0 สัปดาห์ก่อน" ไม่ใช่วันที่ย้อนหลัง
  const othersHaveDigits = /\d/.test(text.replace(m[0], ''));
  if (n <= max && (n <= 12 || othersHaveDigits)) return { n, matched: m[0], start: m.index, hadNumber: true };
  return bareMatch(m, m[2] || 'เดือน', m.index);
}

/**
 * หาวลีวันที่ย้อนหลังแบบสัมพัทธ์ในข้อความ คืน { date, matched, monthBase? } หรือ null
 * ลำดับ: วัน+ชื่อวัน (วันอาทิตย์ที่แล้ว) -> เมื่อวัน+ชื่อวัน -> N วัน -> สัปดาห์/อาทิตย์ -> เดือน
 * (ตรวจ "วัน+ชื่อวัน" ก่อน "อาทิตย์/สัปดาห์" เพื่อให้ "วันอาทิตย์ที่แล้ว" = วันอาทิตย์ล่าสุด ไม่ใช่ 1 สัปดาห์ก่อน)
 */
function extractRelativePhrase(text, today) {
  // 1) วันอาทิตย์ที่แล้ว / วันจันทร์ที่ผ่านมา / วันพุธก่อน
  let m = text.match(new RegExp(`(?:เมื่อ\\s*)?วัน(${WEEKDAY_SRC})\\s*${PAST_SRC}`));
  if (m) return { date: lastWeekday(today, WEEKDAYS[m[1]]), matched: m[0] };

  // 2) เมื่อวันจันทร์ (เล่าเรื่องในอดีต ไม่มี "ที่แล้ว")
  m = text.match(new RegExp(`เมื่อ\\s*วัน(${WEEKDAY_SRC})`));
  if (m) return { date: lastWeekday(today, WEEKDAYS[m[1]]), matched: m[0] };

  // 3) 3 วันที่ผ่านมา / 5 วันก่อน / 3 วันที่แล้ว / 5 วันที่ก่อน
  m = text.match(new RegExp(`(?:เมื่อ\\s*)?(\\d+)\\s*วัน\\s*${PAST_SRC}`));
  if (m && parseInt(m[1], 10) <= MAX_DAYS) return { date: addDays(today, parseInt(m[1], 10)), matched: m[0] };

  // 4) สัปดาห์ที่แล้ว / อาทิตย์ก่อน (= 7 วัน) / 2 สัปดาห์ที่แล้ว (= 14 วัน) ไม่ใช่ "วันอาทิตย์"
  const weekRe = new RegExp(`(?:เมื่อ\\s*)?(?:(\\d+)\\s*)?(สัปดาห์|อาทิตย์)\\s*${PAST_SRC}`, 'g');
  for (const w of text.matchAll(weekRe)) {
    if (text.slice(Math.max(0, w.index - 2), w.index) === 'วัน') continue; // "วันอาทิตย์..." ไม่ใช่สัปดาห์
    const pick = pickCount(text, w, MAX_WEEKS);
    if (pick) return { date: addDays(today, pick.n * 7), matched: pick.matched };
  }

  // 5) เดือนที่แล้ว / 2 เดือนก่อน / เมื่อเดือนที่แล้ว
  //    กันคำอย่าง "ค่าไฟเดือนที่แล้ว" (บิลของเดือนก่อนที่จ่ายวันนี้): ถ้าไม่มี "เมื่อ" ไม่มีตัวเลข และติดกับคำข้างหน้า ไม่ถือเป็นวันที่
  const monthRe = new RegExp(`(?:เมื่อ\\s*)?(?:(\\d+)\\s*)?เดือน\\s*${PAST_SRC}`, 'g');
  for (const mm of text.matchAll(monthRe)) {
    // "วันที่ 25 เดือนที่แล้ว": เลข 25 เป็นวันที่ในเดือน ไม่ใช่จำนวนเดือน
    const dayOfMonth = mm[1] !== undefined && /วันที่\s*$/.test(text.slice(0, mm.index));
    const pick = dayOfMonth ? bareMatch(mm, 'เดือน', mm.index) : pickCount(text, mm, MAX_MONTHS);
    if (!pick) continue;
    const hasMuea = pick.matched.startsWith('เมื่อ');
    const standalone = pick.start === 0 || /\s$/.test(text.slice(0, pick.start));
    if (!(hasMuea || pick.hadNumber || standalone)) continue;
    const r = monthsAgo(today, pick.n);
    return { date: r.date, matched: pick.matched, monthBase: { y: r.year, m: r.month } };
  }
  return null;
}

// ---------- เดือนที่ระบุเป็นตัวเลข ----------
//  "วันที่ 10 เดือน 5" / "10 เดือน 5" (ต้องมีตัวเลขอื่นในข้อความเป็นจำนวนเงิน) / "เดือน 5" (ไม่ระบุวัน ใช้วันเดียวกับวันนี้)
//  ตามด้วย ปี/พ.ศ./ค.ศ. ได้ เช่น "วันที่ 10 เดือน 5 ปี 2568" (ไม่รับเลขปีลอย ๆ เพื่อไม่ให้ชนกับจำนวนเงินอย่าง 2500)
//  ไม่ระบุปี: ใช้ปีนี้ แต่ถ้าวันที่ที่ได้ยังมาไม่ถึง ให้ถอยไปปีก่อน
const YEAR_MARK = String.raw`(?:\s*(?:พ\.ศ\.|ค\.ศ\.|ปี)\s*(\d{2,4}))?`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m = 1-12
// ถ้าวันเกินจำนวนวันของเดือน (เช่น 31 เดือน 2) ใช้วันสุดท้ายของเดือน
const makeDate = (y, m, d) => new Date(y, m - 1, Math.min(d, daysInMonth(y, m)));
function thisOrPreviousYear(today, m, d) {
  const cand = makeDate(today.getFullYear(), m, d);
  return cand > today ? makeDate(today.getFullYear() - 1, m, d) : cand;
}

function extractMonthNumber(text, today) {
  const pick = (y, m, d) => (y ? makeDate(normalizeYear(parseInt(y, 10)), m, d) : thisOrPreviousYear(today, m, d));

  // 1) มีคำว่า "วันที่" นำหน้า: วันที่ 10 เดือน 5 [ปี 2568]
  let f = text.match(new RegExp(String.raw`วันที่\s*(\d{1,2})(?![\d,.])\s*เดือน\s*(\d{1,2})(?!\d)` + YEAR_MARK));
  if (f) {
    const d = parseInt(f[1], 10);
    const mo = parseInt(f[2], 10);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return { date: pick(f[3], mo, d), matched: f[0] };
  }

  // 2) ไม่มี "วันที่": 10 เดือน 5 (เลขวันต้องไม่ติดกับเลขอื่น เช่น 3025 และต้องมีตัวเลขอื่นเหลือเป็นจำนวนเงิน)
  f = text.match(new RegExp(String.raw`(^|[^\d,.])(\d{1,2})(?![\d,.])\s*เดือน\s*(\d{1,2})(?!\d)` + YEAR_MARK));
  if (f) {
    const matched = f[0].slice(f[1].length);
    const d = parseInt(f[2], 10);
    const mo = parseInt(f[3], 10);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && /\d/.test(text.replace(matched, ''))) {
      return { date: pick(f[4], mo, d), matched };
    }
  }

  // 3) เดือนอย่างเดียว: เดือน 5 -> วันเดียวกับวันนี้ในเดือน 5
  const o = text.match(new RegExp(String.raw`เดือน\s*(\d{1,2})(?!\d)` + YEAR_MARK));
  if (o) {
    const mo = parseInt(o[1], 10);
    if (mo >= 1 && mo <= 12) return { date: pick(o[2], mo, today.getDate()), matched: o[0] };
  }
  return null;
}

/**
 * สกัดวันที่จากข้อความไทย แล้วคืนข้อความที่ตัดส่วนวันที่ออก
 * รองรับ: วันนี้ / เมื่อวาน / เมื่อวานซืน / N วันก่อน / N วันที่ผ่านมา / สัปดาห์ที่แล้ว / N อาทิตย์ก่อน /
 *        วันอาทิตย์ที่แล้ว (วันนั้นล่าสุด) / เมื่อวันจันทร์ / เดือนที่แล้ว / N เดือนก่อน /
 *        วันที่ 10 เดือน 5 / 10 เดือน 5 / เดือน 5 (เดือนเป็นตัวเลข ไม่ระบุปี = ปีนี้ ถ้ายังมาไม่ถึงใช้ปีก่อน) /
 *        วันที่ 25 / 25 ก.ย. / 25 ก.ย. 2569 / วันที่ 25 ก.ย. ปี 69 / 25/09/2026 (ปีแบบไม่มีคำนำหน้าต้องเป็น 4 หลัก เพื่อไม่ชนกับจำนวนเงิน)
 */
export function extractDateAndCleanText(rawText, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today);
  let text = rawText;
  let monthBase = null; // ตั้งเมื่อเจอ "เดือนที่แล้ว" ใช้ร่วมกับ "วันที่ 25 เดือนที่แล้ว"

  // 1) วันแบบสัมพัทธ์
  if (/เมื่อวานซืน/.test(text)) {
    target.setDate(today.getDate() - 2);
    text = text.replace(/เมื่อวานซืน/g, '');
  } else if (/เมื่อวาน/.test(text)) {
    target.setDate(today.getDate() - 1);
    text = text.replace(/เมื่อวานนี้|เมื่อวาน/g, '');
  } else if (/วันนี้/.test(text)) {
    text = text.replace(/วันนี้/g, '');
  } else {
    const rel = extractRelativePhrase(text, today);
    if (rel) {
      target = rel.date;
      monthBase = rel.monthBase || null;
      text = text.replace(rel.matched, '');
    }
  }

  // 2) วันที่ระบุตรง ๆ
  const slash = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  const fullRe = new RegExp(
    `(?:วันที่\\s*)?(\\d{1,2})\\s*(${MONTH_REGEX_SRC})` +
      `(?:\\s*(?:พ\\.ศ\\.|ค\\.ศ\\.|ปี)\\s*(\\d{2,4})|\\s+(25\\d{2}|20\\d{2}))?`
  );
  const named = text.match(fullRe);
  let numMonth = null;

  if (slash && parseInt(slash[1], 10) <= 31 && parseInt(slash[2], 10) <= 12) {
    const d = parseInt(slash[1], 10);
    const m = parseInt(slash[2], 10);
    const y = slash[3] ? normalizeYear(parseInt(slash[3], 10)) : today.getFullYear();
    target = new Date(y, m - 1, d);
    text = text.replace(slash[0], '');
  } else if (named && parseInt(named[1], 10) >= 1 && parseInt(named[1], 10) <= 31) {
    const d = parseInt(named[1], 10);
    const m = MONTH_MAP[named[2]];
    const yearStr = named[3] || named[4];
    const y = yearStr ? normalizeYear(parseInt(yearStr, 10)) : today.getFullYear();
    target = new Date(y, m - 1, d);
    text = text.replace(named[0], '');
  } else if ((numMonth = extractMonthNumber(text, today))) {
    target = numMonth.date; // วันที่ 10 เดือน 5 / 10 เดือน 5 / เดือน 5
    text = text.replace(numMonth.matched, '');
  } else {
    const dayOnly = text.match(/วันที่\s*(\d{1,2})/);
    if (dayOnly) {
      const d = parseInt(dayOnly[1], 10);
      let cand;
      if (monthBase) {
        const lastDay = new Date(monthBase.y, monthBase.m + 1, 0).getDate();
        cand = new Date(monthBase.y, monthBase.m, Math.min(d, lastDay)); // "วันที่ 25 เดือนที่แล้ว"
      } else {
        cand = new Date(today.getFullYear(), today.getMonth(), d);
        if (cand > today) cand = new Date(today.getFullYear(), today.getMonth() - 1, d); // วันที่ยังมาไม่ถึง = เดือนก่อน
      }
      target = cand;
      text = text.replace(dayOnly[0], '');
    }
  }

  return { date: fmtDate(target), cleanedText: text.replace(/\s+/g, ' ').trim() };
}

const INCOME_KW = [
  'ได้รับ', 'เงินเข้า', 'โอนเข้า', 'รับโอน', 'เงินเดือน', 'โบนัส', 'รายได้', 'ขายได้', 'ได้เงิน',
  'ขายของ', 'ฟรีแลนซ์', 'งานนอก', 'ค่าจ้าง', 'กำไร', 'เงินคืน', 'cashback', 'ปันผล', 'ดอกเบี้ย',
  'เข้าบัญชี', 'ถูกหวย', 'รางวัล', 'คืนเงิน', 'ได้มา', 'รับเงิน', 'ยอดเข้า', 'รายรับ',
];
const EXPENSE_KW = [
  'จ่าย', 'ค่า', 'ซื้อ', 'เติม', 'กิน', 'ทาน', 'เช่า', 'โอนออก', 'ชำระ', 'ถอน',
  'โดนหัก', 'ตัดบัญชี', 'เสีย', 'ซ่อม', 'ผ่อน',
];

function detectType(lower) {
  const incIdx = INCOME_KW.map((k) => lower.indexOf(k)).filter((i) => i !== -1);
  const expIdx = EXPENSE_KW.map((k) => lower.indexOf(k)).filter((i) => i !== -1);
  if (incIdx.length && !expIdx.length) return 'income';
  if (incIdx.length && expIdx.length) return Math.min(...incIdx) <= Math.min(...expIdx) ? 'income' : 'expense';
  return 'expense';
}

// เลือกจำนวนเงิน: ตัวเลขที่ตามด้วย "บาท" ก่อน ไม่มีก็ใช้ตัวเลขสุดท้ายของข้อความ (เช่น "7-11 145" -> 145)
function extractAmount(text) {
  const baht = text.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|baht|thb|฿|บ\.)/i);
  let token = '';
  if (baht) token = baht[1];
  else {
    const all = text.match(/\d[\d,]*(?:\.\d{1,2})?/g);
    if (all) token = all[all.length - 1];
  }
  const amount = token ? parseFloat(token.replace(/,/g, '')) : 0;
  return { token, amount: Number.isFinite(amount) ? amount : 0 };
}

/**
 * แปลงข้อความธรรมชาติเป็นร่างรายการ
 * คืน { type, amount, category_id, category_name, note, transaction_date, confidence, raw_text }
 */
export function parseNaturalLanguage(text, categories = [], now = new Date()) {
  if (!text || !text.trim()) return null;
  const raw = text.trim();

  const { date, cleanedText } = extractDateAndCleanText(raw, now);
  const type = detectType(cleanedText.toLowerCase());
  const { token, amount } = extractAmount(cleanedText);

  let note = cleanedText;
  if (token) {
    const i = note.lastIndexOf(token);
    note = note.slice(0, i) + note.slice(i + token.length);
  }
  note = note
    .replace(/บาท|baht|thb|฿|บ\./gi, '')
    .replace(/ได้รับ|เงินเข้า|โอนเข้า|รับโอน|ชำระ|จ่าย/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!note) note = cleanedText;

  const keywordHit = matchCategoryByKeyword(cleanedText, categories, type);
  const categoryId = keywordHit || autoCategorize(cleanedText, categories, type) || '';
  const cat = categories.find((c) => c.category_id === categoryId);

  return {
    type,
    amount: amount || '',
    category_id: categoryId,
    category_name: cat ? cat.name : type === 'income' ? 'รายรับ' : 'รายจ่าย',
    note,
    transaction_date: date,
    confidence: amount > 0 && keywordHit ? 'high' : 'medium',
    raw_text: raw,
  };
}
