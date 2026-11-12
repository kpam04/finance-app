const { bangkokToday, monthKeyOf, daysInMonth, parseMonthKey, addMonths, addDaysIso, pad } = require('./dateUtil');

// วิเคราะห์พฤติกรรมการใช้จ่าย (คำนวณด้วยโค้ดล้วน ๆ ไม่ใช้ AI ตรวจสอบและทดสอบได้)
// เทียบเดือนที่เลือกกับค่าเฉลี่ยของ "3 เดือนเต็มก่อนหน้า" (เฉพาะเดือนที่มีรายการ) ตัวเลขที่ AI ใช้เขียนคำแนะนำมาจากที่นี่เท่านั้น
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const BASE_MONTHS = 3; // จำนวนเดือนเต็มก่อนหน้าที่ใช้เป็นค่าเฉลี่ยอ้างอิง
const WEEKDAY_DAYS = 90; // ช่วงดูรูปแบบรายวัน
const SMALL_AMOUNT = 100; // "รายจ่ายเล็ก ๆ" = น้อยกว่า 100 บาท
const SMALL_DAYS = 30;
const MIN_DAYS_PROJECTION = 7; // ต้องผ่านไปอย่างน้อย 7 วันถึงจะคาดการณ์สิ้นเดือนได้
const ANOMALY_RATIO = 1.3; // สูงกว่าที่ควรเป็น 30% ขึ้นไป
const ANOMALY_MIN_EXCESS = 200; // และเกินค่าปกติอย่างน้อย 200 บาท (ไม่เตือนเรื่องเล็กน้อย)
const BIG_TXN_SHARE = 0.10; // รายการเดียวตั้งแต่ 10% ของรายจ่ายเฉลี่ยต่อเดือน = ก้อนใหญ่ ไม่นับในค่าเฉลี่ยต่อวัน
const LUMPY_MIN_SHARE = 0.05; // และยอดเฉลี่ยต่อครั้งตั้งแต่ 5% ของรายจ่ายเฉลี่ยต่อเดือน (ก้อนจริง ไม่ใช่แค่จ่ายไม่บ่อย)
const LUMPY_MAX_COUNT = 3; // หมวดที่เดือนอ้างอิงมีรายการเฉลี่ยน้อยกว่า 3 รายการต่อเดือน (เช่น ค่าเช่า) ถือว่าจ่ายเป็นก้อน ไม่คิดตามสัดส่วนวัน

const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;
const round0 = (n) => Math.round(Number(n));
const isoOf = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

function emptyMonth() {
  return { income: 0, expense: 0, count: 0, cats: new Map(), catN: new Map(), catFixed: new Map() };
}

// ---------- ค่าประจำ (fixed) ----------
// รายการที่ "ยอดเท่าเดิม ตัดราววันเดิมทุกเดือน" (เช่น Netflix ที่ผู้ใช้จดเอง) ไม่ควรถูกนับเป็นพฤติกรรมการใช้จ่าย
//  ชั้น 1: มาจากรายการเกิดซ้ำรายเดือน/รายปี หรืองวดผ่อน → t.fixed = true (route ส่งมา)
//  ชั้น 2: เดาจากรายการที่จดเอง: หมวดเดียวกัน ยอดต่างกันไม่เกิน 5% เดือนละ 1 ครั้งพอดี ต่อเนื่อง 3 เดือน (มีชื่อบริการรายเดือนในโน้ต = 2 เดือน)
//          วันที่ห่างกันไม่เกิน ±3 วัน / เดือนไหนมียอดนี้ 2 ครั้งขึ้นไป = ไม่ใช่ค่าประจำ / โน้ตเป็นเรื่องดูหนังในโรง = ไม่ใช่
const FIXED_AMOUNT_TOL = 0.05;
const FIXED_DAY_TOL = 3;
const SUB_WORDS = /netflix|spotify|youtube|icloud|disney|prime\s*video|google\s*one|apple\s*(music|one|tv)|viu|wetv|iqiyi|trueid|true\s*id|hbo|max\b|canva|chatgpt|ฟิตเนส|fitness|gym|ยิม|ค่าเน็ต|อินเทอร์เน็ต|internet|wifi|ค่าโทร|ค่ามือถือ|รายเดือน|สมาชิก|subscription/i;
const NOT_FIXED_WORDS = /ดูหนัง|โรงหนัง|โรงภาพยนตร์|ภาพยนตร์|cinema|movie|major|\bsf\b|sfx|ตั๋วหนัง/i;
const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

function detectFixed(rows) {
  const byCat = new Map();
  for (const r of rows) {
    if (r.type !== 'expense' || r.fixed || NOT_FIXED_WORDS.test(r.note)) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => a.amount - b.amount);
    // จัดกลุ่มยอดใกล้เคียง (ต่างจากยอดแรกของกลุ่มไม่เกิน 5%)
    const clusters = [];
    for (const r of list) {
      const c = clusters[clusters.length - 1];
      if (c && r.amount <= c[0].amount * (1 + FIXED_AMOUNT_TOL)) c.push(r); else clusters.push([r]);
    }
    for (const c of clusters) {
      if (c.length < 2) continue;
      const perMonth = new Map();
      for (const r of c) { const m = monthIndex(r.iso); perMonth.set(m, (perMonth.get(m) || []).concat(r)); }
      if ([...perMonth.values()].some((v) => v.length > 1)) continue; // เดือนเดียวมี 2 ครั้ง → ไม่ใช่ค่าประจำ
      const ms = [...perMonth.keys()].sort((a, b) => a - b);
      const sub = c.some((r) => SUB_WORDS.test(r.note));
      const need = sub ? 2 : 3;
      // หาช่วงเดือนต่อเนื่อง แล้วตรวจว่าวันที่ใกล้กัน
      let run = [ms[0]];
      const runs = [];
      for (let i = 1; i < ms.length; i += 1) { if (ms[i] === ms[i - 1] + 1) run.push(ms[i]); else { runs.push(run); run = [ms[i]]; } }
      runs.push(run);
      for (const rn of runs) {
        if (rn.length < need) continue;
        const days = rn.map((m) => Number(perMonth.get(m)[0].iso.slice(8, 10)));
        if (Math.max(...days) - Math.min(...days) > FIXED_DAY_TOL * 2) continue;
        for (const m of rn) perMonth.get(m)[0].fixed = 'detected';
      }
    }
  }
}

// txns: [{ date, type, amount, category, note?, fixed? }] / categories: [{ _id, name, color, type }]
// month: 'YYYY-MM' (ไม่ระบุ = เดือนปัจจุบันตามเวลาไทย) / todayIso: วันนี้ตามเวลาไทย (ส่งเข้ามาเพื่อให้ทดสอบได้)
function analyze({ txns = [], categories = [], todayIso = bangkokToday(), month } = {}) {
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const pm = parseMonthKey(month);
  const year = pm ? pm.year : ty;
  const mon = pm ? pm.month : tm;
  const key = monthKeyOf(year, mon);
  const dim = daysInMonth(year, mon);
  const isCurrent = year === ty && mon === tm;
  const isFuture = year * 12 + mon > ty * 12 + tm;
  const daysElapsed = isFuture ? 0 : isCurrent ? td : dim;
  const catInfo = new Map(categories.map((c) => [String(c._id !== undefined ? c._id : c.category_id), c]));
  const catName = (id) => (catInfo.get(String(id)) ? catInfo.get(String(id)).name : 'ไม่ทราบหมวด');
  const catColor = (id) => (catInfo.get(String(id)) ? catInfo.get(String(id)).color : '#9ca3af');

  // รวมตามเดือน
  const months = new Map();
  const getMonth = (k) => { if (!months.has(k)) months.set(k, emptyMonth()); return months.get(k); };
  const rows = [];
  for (const t of txns) {
    const iso = isoOf(t.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const amount = Number(t.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const type = t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : null;
    if (!type) continue;
    const m = getMonth(iso.slice(0, 7));
    m.count += 1;
    m[type] += amount;
    rows.push({ iso, type, amount, category: String(t.category), note: String(t.note || ''), fixed: t.fixed ? 'recurring' : false, inst: !!t.installment_paid });
  }
  detectFixed(rows);
  // รวมรายหมวด: ยอดรวม / ส่วนค่าประจำ / ส่วนที่จ่ายตามพฤติกรรม (จำนวนครั้งนับเฉพาะส่วนหลัง)
  for (const r of rows) {
    if (r.type !== 'expense') continue;
    const m = months.get(r.iso.slice(0, 7));
    m.cats.set(r.category, (m.cats.get(r.category) || 0) + r.amount);
    if (r.fixed) m.catFixed.set(r.category, (m.catFixed.get(r.category) || 0) + r.amount);
    else m.catN.set(r.category, (m.catN.get(r.category) || 0) + 1);
  }

  const cur = months.get(key) || emptyMonth();

  // เดือนอ้างอิง (3 เดือนเต็มก่อนหน้า) เฉพาะเดือนที่มีรายการ
  const baseKeys = [];
  for (let k = BASE_MONTHS; k >= 1; k -= 1) {
    const a = addMonths(year, mon, -k);
    baseKeys.push(monthKeyOf(a.year, a.month));
  }
  const baseUsed = baseKeys.filter((k) => months.has(k) && months.get(k).count > 0);
  const baseN = baseUsed.length;
  const baseExpense = baseUsed.reduce((s, k) => s + months.get(k).expense, 0);
  const baseIncome = baseUsed.reduce((s, k) => s + months.get(k).income, 0);
  const baseDays = baseUsed.reduce((s, k) => { const [y, m] = k.split('-').map(Number); return s + daysInMonth(y, m); }, 0);
  const baseCat = new Map();
  const baseCatN = new Map();
  const baseFixed = new Map();
  for (const k of baseUsed) {
    for (const [id, v] of months.get(k).cats) baseCat.set(id, (baseCat.get(id) || 0) + v);
    for (const [id, c] of months.get(k).catN) baseCatN.set(id, (baseCatN.get(id) || 0) + c);
    for (const [id, v] of months.get(k).catFixed) baseFixed.set(id, (baseFixed.get(id) || 0) + v);
  }
  const hasBaseline = baseN >= 1;
  const baseline = {
    months: baseN,
    avg_expense_month: hasBaseline ? round0(baseExpense / baseN) : null,
    avg_income_month: hasBaseline ? round0(baseIncome / baseN) : null,
    avg_surplus: hasBaseline ? round0((baseIncome - baseExpense) / baseN) : null,
    avg_daily_expense: null, // คิดด้านล่าง (ไม่รวมหมวดที่จ่ายเป็นก้อน)
  };

  // หมวดจ่ายเป็นก้อน = ส่วนที่ไม่ใช่ค่าประจำ จ่ายไม่บ่อย (เฉลี่ยน้อยกว่า 3 ครั้ง/เดือน) และยอดต่อครั้งใหญ่ (≥ 5% ของรายจ่ายเฉลี่ยต่อเดือน)
  const baseMonthExp = hasBaseline ? baseExpense / baseN : 0;
  // และต้องจ่าย "เกือบทุกเดือน" (อย่างน้อย 2 ใน 3 เดือน เช่น ค่าเช่าที่จ่ายคนละวัน) ถ้านาน ๆ มาที (ค่าเทอม) = รายจ่ายพิเศษ
  const presentMonths = (id) => baseUsed.filter((k) => (months.get(k).catN.get(id) || 0) > 0).length;
  const isLumpy = (id) => {
    if (!hasBaseline) return false;
    const n = baseCatN.get(id) || 0;
    if (n === 0 || n / baseN >= LUMPY_MAX_COUNT) return false;
    if (presentMonths(id) < Math.ceil((baseN * 2) / 3)) return false;
    return ((baseCat.get(id) || 0) - (baseFixed.get(id) || 0)) / n >= baseMonthExp * LUMPY_MIN_SHARE;
  };
  const lumpyIds = new Set([...baseCat.keys()].filter(isLumpy));
  // รายจ่ายพิเศษ = รายการเดียวที่ใหญ่ตั้งแต่ 10% ของรายจ่ายเฉลี่ยต่อเดือน ไม่ใช่ค่าประจำ และไม่อยู่ในหมวดจ่ายเป็นก้อน (เช่น ค่าเทอม บัตรคอนเสิร์ต)
  //  แยกออกจากการใช้จ่ายปกติทั้งหมด (ค่าเฉลี่ย / แถบรายหมวด / หมวดผิดปกติ) แต่ยังนับในคาดการณ์สิ้นเดือน และแสดงเป็นรายการแยก
  for (const r of rows) r.special = r.type === 'expense' && !r.fixed && baseMonthExp > 0 && r.amount >= baseMonthExp * BIG_TXN_SHARE && !lumpyIds.has(r.category);
  const specialBy = (id, monthKeys) => rows.filter((r) => r.special && r.category === id && monthKeys.includes(r.iso.slice(0, 7))).reduce((t, r) => t + r.amount, 0);
  // ส่วนพฤติกรรมของหมวดในเดือนอ้างอิง (ไม่รวมค่าประจำและรายจ่ายพิเศษ)
  const baseVar = (id) => (baseCat.get(id) || 0) - (baseFixed.get(id) || 0) - specialBy(id, baseUsed);
  // ใช้จ่ายเฉลี่ยต่อวัน / 7 วันล่าสุด / รูปแบบรายวัน: ไม่นับค่าประจำและหมวดจ่ายเป็นก้อน (สะท้อนพฤติกรรมที่คุมได้)
  // รายการก้อนใหญ่ครั้งเดียว (≥ 10% ของรายจ่ายเฉลี่ยต่อเดือน เช่น บัตรคอนเสิร์ต) ก็ไม่นับในค่าเฉลี่ยต่อวัน (หมวดนั้นยังถูกเทียบ/เตือนตามปกติ)
  const bigOne = (r) => r.special;
  const isBehavior = (r) => r.type === 'expense' && !r.fixed && !lumpyIds.has(r.category) && !r.special;
  const sumBehavior = (from, to) => rows.filter((r) => isBehavior(r) && r.iso >= from && r.iso <= to).reduce((t, r) => t + r.amount, 0);
  const monthStart = `${key}-01`;
  const monthEnd = `${key}-${pad(dim)}`;
  const baseBehavior = hasBaseline ? rows.filter((r) => isBehavior(r) && baseUsed.includes(r.iso.slice(0, 7))).reduce((t, r) => t + r.amount, 0) : 0;
  baseline.avg_daily_expense = hasBaseline && baseDays > 0 ? round1(baseBehavior / baseDays) : null;
  const avgDaily = daysElapsed > 0 ? round1(sumBehavior(monthStart, monthEnd) / daysElapsed) : null;
  // ชื่อหมวดที่มีส่วนที่ไม่นับ (ค่าประจำ/ก้อน) เรียงตามยอด ใช้แสดง "ไม่รวมค่าประจำและรายจ่ายก้อน เช่น …"
  const exclTotals = new Map();
  for (const r of rows) if (r.type === 'expense' && !isBehavior(r) && (baseUsed.includes(r.iso.slice(0, 7)) || r.iso.slice(0, 7) === key)) exclTotals.set(r.category, (exclTotals.get(r.category) || 0) + r.amount);
  const lumpyNames = [...exclTotals.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => catName(id)).slice(0, 3);
  const pctVsBase = avgDaily !== null && baseline.avg_daily_expense ? round1(((avgDaily - baseline.avg_daily_expense) / baseline.avg_daily_expense) * 100) : null;

  // รายจ่ายตามหมวดเทียบค่าเฉลี่ย (คิดตามสัดส่วนวันที่ผ่านไป)
  const categoriesOut = [...cur.cats.entries()]
    .map(([id, total]) => {
      // ยอดที่ใช้เทียบ = ยอดรวมหมวด ไม่รวมรายจ่ายพิเศษ (รายจ่ายพิเศษแสดงแยก)
      const special = specialBy(id, [key]);
      const amount = total - special;
      const baseAvg = hasBaseline && baseCat.has(id) ? (baseCat.get(id) - specialBy(id, baseUsed)) / baseN : null;
      // ระดับปกติถึงวันนี้ = ค่าประจำเฉลี่ย (เต็มเดือน) + ส่วนที่จ่ายตามพฤติกรรม (หมวดก้อน = เต็มเดือน / หมวดทั่วไป = ตามสัดส่วนวัน)
      const lumpy = lumpyIds.has(id);
      const fixedAvg = baseAvg !== null ? (baseFixed.get(id) || 0) / baseN : 0;
      const varAvg = baseAvg !== null ? Math.max(0, baseAvg - fixedAvg) : 0;
      const expected = baseAvg !== null && daysElapsed > 0 ? fixedAvg + (lumpy ? varAvg : varAvg * (daysElapsed / dim)) : null;
      const ratio = expected && expected > 0 ? amount / expected : null;
      const excess = expected !== null ? amount - expected : null;
      const flagged = daysElapsed >= MIN_DAYS_PROJECTION && ratio !== null && ratio >= ANOMALY_RATIO && excess >= ANOMALY_MIN_EXCESS;
      return {
        category_id: id,
        name: catName(id),
        color: catColor(id),
        amount: round0(amount),
        total_amount: round0(total),
        special_amount: round0(special),
        share_pct: cur.expense > 0 ? round1((total / cur.expense) * 100) : 0,
        base_avg: baseAvg !== null ? round0(baseAvg) : null,
        lumpy,
        fixed_amount: round0(cur.catFixed.get(id) || 0), // ส่วนที่เป็นค่าประจำของเดือนนี้
        // ส่วน "พฤติกรรม" (ไม่รวมค่าประจำ) ใช้กับแถบรายหมวดในการ์ดพฤติกรรม
        ...(() => {
          const vAmt = amount - (cur.catFixed.get(id) || 0);
          const vExp = baseAvg !== null && varAvg > 0 && daysElapsed > 0 ? (lumpy ? varAvg : varAvg * (daysElapsed / dim)) : null; // ไม่มีประวัติส่วนนี้ = ไม่มีเส้นปกติ
          const vRatio = vExp && vExp > 0 ? vAmt / vExp : null;
          return {
            var_amount: round0(vAmt),
            var_expected: vExp !== null ? round0(vExp) : null,
            var_pct: vRatio !== null ? round1((vRatio - 1) * 100) : null,
            var_flagged: daysElapsed >= MIN_DAYS_PROJECTION && vRatio !== null && vRatio >= ANOMALY_RATIO && vAmt - vExp >= ANOMALY_MIN_EXCESS,
          };
        })(),
        expected_to_date: expected !== null ? round0(expected) : null,
        pct_vs_expected: ratio !== null ? round1((ratio - 1) * 100) : null,
        excess: excess !== null ? round0(excess) : null,
        flagged,
      };
    })
    .filter((c) => c.amount > 0 || c.special_amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const anomalies = categoriesOut.filter((c) => c.flagged).sort((a, b) => b.excess - a.excess).slice(0, 3);

  // ค่าเฉลี่ยต่อเดือนรายหมวดของเดือนอ้างอิง (ใช้กับตัวจำลองแผน รวมหมวดที่เดือนนี้ยังไม่มีรายการ)
  const baseCategories = [...baseCat.entries()]
    .map(([id, total]) => ({ category_id: id, name: catName(id), color: catColor(id), base_avg: round0(total / baseN), lumpy: lumpyIds.has(id), fixed_avg: round0((baseFixed.get(id) || 0) / baseN) }))
    .sort((a, b) => b.base_avg - a.base_avg);

  // รูปแบบรายวันของสัปดาห์ (ย้อนหลัง 90 วัน)
  const endIso = isCurrent ? todayIso : `${key}-${pad(dim)}`;
  const wStart = addDaysIso(endIso, -(WEEKDAY_DAYS - 1));
  const wRows = isFuture ? [] : rows.filter((r) => isBehavior(r) && r.iso >= wStart && r.iso <= endIso); // ไม่รวมค่าประจำ/ก้อน
  const byDay = THAI_DAYS.map((name, day) => ({ day, name, amount: 0, days: 0 }));
  // จำนวนวันนั้น ๆ ในช่วง 90 วัน (ใช้คิดเฉลี่ยต่อวัน เช่น วันจันทร์มี 13 วัน)
  for (let i = 0; i < WEEKDAY_DAYS; i += 1) byDay[new Date(`${addDaysIso(endIso, -i)}T00:00:00Z`).getUTCDay()].days += 1;
  for (const r of wRows) byDay[new Date(`${r.iso}T00:00:00Z`).getUTCDay()].amount += r.amount;
  const wTotal = byDay.reduce((s, d) => s + d.amount, 0);
  const distinctDays = new Set(wRows.map((r) => r.iso)).size;
  const weekdayReliable = wRows.length >= 20 && distinctDays >= 10 && wTotal > 0;
  byDay.forEach((d) => { d.avg = d.days > 0 ? round0(d.amount / d.days) : 0; d.amount = round0(d.amount); d.share_pct = wTotal > 0 ? round1((d.amount / wTotal) * 100) : 0; });
  const peak = weekdayReliable ? [...byDay].sort((a, b) => b.amount - a.amount)[0] : null;
  const weekendShare = weekdayReliable ? round1(byDay[0].share_pct + byDay[6].share_pct) : null;

  // รายจ่ายเล็ก ๆ ถี่ ๆ (30 วันล่าสุด)
  const sStart = addDaysIso(endIso, -(SMALL_DAYS - 1));
  const sAll = isFuture ? [] : rows.filter((r) => r.type === 'expense' && r.iso >= sStart && r.iso <= endIso);
  const sSmall = sAll.filter((r) => r.amount < SMALL_AMOUNT);
  const sAllTotal = sAll.reduce((s, r) => s + r.amount, 0);
  const sSmallTotal = sSmall.reduce((s, r) => s + r.amount, 0);
  const small = {
    threshold: SMALL_AMOUNT,
    days: SMALL_DAYS,
    count: sSmall.length,
    total: round0(sSmallTotal),
    share_pct: sAllTotal > 0 ? round1((sSmallTotal / sAllTotal) * 100) : 0,
    flagged: sSmall.length >= 15 && sAllTotal > 0 && sSmallTotal / sAllTotal >= 0.05,
  };

  // ใช้จ่าย 7 วันล่าสุด (ไม่รวมหมวดจ่ายก้อน) เทียบ "สัปดาห์ปกติ" = ค่าเฉลี่ยต่อวันเดิม × 7
  //  trend: ช่วง 7 วันนี้ใช้ต่อวันน้อยลง/มากขึ้นกว่าทั้งเดือน (ต่างกันตั้งแต่ 10% และเดือนผ่านไปอย่างน้อย 10 วัน)
  const kStart = addDaysIso(endIso, -6);
  const last7 = isFuture ? null : round0(rows.filter((r) => isBehavior(r) && r.iso >= kStart && r.iso <= endIso).reduce((t, r) => t + r.amount, 0));
  const baseWeek = baseline.avg_daily_expense !== null ? round0(baseline.avg_daily_expense * 7) : null;
  let weekTrend = null;
  if (last7 !== null && avgDaily && daysElapsed >= 10) {
    const r = last7 / 7 / avgDaily;
    weekTrend = r <= 0.9 ? 'down' : r >= 1.1 ? 'up' : 'flat';
  }
  const weekly = {
    last7, from: kStart, to: endIso, base: baseWeek,
    pct_vs_base: last7 !== null && baseWeek ? round1(((last7 - baseWeek) / baseWeek) * 100) : null,
    trend: weekTrend,
  };

  // รายการใหญ่สุดของเดือน
  const monthRows = rows.filter((r) => r.type === 'expense' && r.iso.slice(0, 7) === key);
  const big = monthRows.reduce((a, r) => (!a || r.amount > a.amount ? r : a), null);
  const biggest = big ? { amount: round0(big.amount), category_name: catName(big.category), date: big.iso } : null;

  // คาดการณ์รายจ่ายสิ้นเดือน (เฉลี่ยตามวันที่ผ่านไป) ไม่คาดการณ์ถ้าข้อมูลน้อยเกินไป
  const projectable = !isFuture && cur.expense > 0 && (!isCurrent || daysElapsed >= MIN_DAYS_PROJECTION);
  // เดือนปัจจุบัน: หมวดที่จ่ายทยอยคิดตามอัตราต่อวัน / หมวดที่จ่ายเป็นก้อน (เช่น ค่าเช่า) ไม่คูณตามวัน ใช้ยอดที่จ่ายแล้วหรือค่าเฉลี่ยต่อเดือน (ที่มากกว่า)
  //  และหมวดก้อนที่เดือนนี้ยังไม่จ่าย นับค่าเฉลี่ยต่อเดือนไว้ด้วย (กันไม่ให้ค่าเช่าต้นเดือนถูกคูณจนคาดการณ์สูงเกินจริง)
  let expenseEnd = null;
  if (projectable && !isCurrent) expenseEnd = round0(cur.expense);
  else if (projectable) {
    let sum = 0;
    // แต่ละหมวด: ค่าประจำ = max(ที่จ่ายแล้ว, ค่าเฉลี่ย) / ส่วนก้อน = max(ที่จ่ายแล้ว, ค่าเฉลี่ย) / ส่วนทั่วไป = ตามอัตราต่อวัน
    const ids = new Set([...cur.cats.keys(), ...baseCat.keys()]);
    for (const id of ids) {
      const curTotal = cur.cats.get(id) || 0;
      const curFix = cur.catFixed.get(id) || 0;
      const curVar = curTotal - curFix;
      const fixAvg = hasBaseline ? (baseFixed.get(id) || 0) / baseN : 0;
      const varAvg = hasBaseline ? baseVar(id) / baseN : 0;
      sum += Math.max(curFix, fixAvg);
      // รายการก้อนใหญ่ครั้งเดียวนับครั้งเดียว ไม่คูณตามจำนวนวัน
      const curBig = rows.filter((r) => r.type === 'expense' && !r.fixed && r.category === id && r.iso.slice(0, 7) === key && bigOne(r)).reduce((t, r) => t + r.amount, 0);
      sum += lumpyIds.has(id) ? Math.max(curVar, varAvg) : ((curVar - curBig) / daysElapsed) * dim + curBig;
    }
    expenseEnd = round0(sum);
  }
  const incomeRef = Math.max(cur.income, baseline.avg_income_month || 0);
  const projection = {
    expense_end: expenseEnd,
    based_on_days: projectable ? daysElapsed : null,
    income_ref: incomeRef > 0 ? round0(incomeRef) : null,
    pct_of_income: expenseEnd !== null && incomeRef > 0 ? round1((expenseEnd / incomeRef) * 100) : null,
    over_income: expenseEnd !== null && incomeRef > 0 ? expenseEnd > incomeRef : null,
  };

  // แนวโน้มรายเดือน
  const trendMonths = [...baseUsed, ...(cur.count > 0 || isCurrent ? [key] : [])].map((k) => {
    const m = months.get(k) || emptyMonth();
    return { month: k, income: round0(m.income), expense: round0(m.expense), net: round0(m.income - m.expense), savings_rate: m.income > 0 ? round1(((m.income - m.expense) / m.income) * 100) : null, partial: isCurrent && k === key };
  });
  const rates = trendMonths.filter((m) => !m.partial && m.savings_rate !== null).map((m) => m.savings_rate);

  const enoughForTrend = baseN >= 2;
  const limits = [];
  if (!hasBaseline) limits.push('ยังไม่มีประวัติเดือนก่อนหน้า ระบบจึงยังเทียบกับค่าเฉลี่ยของคุณไม่ได้');
  else if (!enoughForTrend) limits.push('มีประวัติเพียง 1 เดือน แนวโน้มยังไม่แม่นยำ');
  if (isCurrent && daysElapsed < MIN_DAYS_PROJECTION) limits.push(`เดือนนี้ผ่านไปเพียง ${daysElapsed} วัน ยังคาดการณ์รายจ่ายสิ้นเดือนไม่ได้`);
  if (!weekdayReliable && cur.count > 0) limits.push('ข้อมูลยังไม่พอที่จะดูรูปแบบการใช้จ่ายรายวัน');

  return {
    month: key,
    is_current: isCurrent,
    days_elapsed: daysElapsed,
    days_in_month: dim,
    data: { txn_count: cur.count, base_months: baseN, has_baseline: hasBaseline, enough_for_trend: enoughForTrend, enough_for_projection: projectable, has_data: cur.count > 0 || baseN > 0 },
    totals: { income: round0(cur.income), expense: round0(cur.expense), net: round0(cur.income - cur.expense), savings_rate: cur.income > 0 ? round1(((cur.income - cur.expense) / cur.income) * 100) : null },
    daily: { avg: avgDaily, base_avg: baseline.avg_daily_expense, pct_vs_base: pctVsBase, excludes_lumpy: exclTotals.size > 0, lumpy_names: lumpyNames },
    baseline,
    categories: categoriesOut,
    base_categories: baseCategories,
    anomalies,
    weekday: { reliable: weekdayReliable, by_day: byDay, peak: peak ? { name: peak.name, share_pct: peak.share_pct } : null, weekend_share_pct: weekendShare },
    small_purchases: small,
    weekly,
    // รายจ่ายพิเศษของเดือนที่ดู (แสดงแยกจากการใช้จ่ายปกติ)
    special: (() => {
      const list = rows.filter((r) => r.special && r.iso.slice(0, 7) === key).sort((a, b) => a.iso.localeCompare(b.iso));
      return { total: round0(list.reduce((t, r) => t + r.amount, 0)), threshold: hasBaseline ? round0(baseMonthExp * BIG_TXN_SHARE) : null, items: list.slice(0, 10).map((r) => ({ date: r.iso, category_id: r.category, category_name: catName(r.category), note: Array.from(r.note).slice(0, 40).join(''), amount: round0(r.amount) })) };
    })(),
    // ค่าใช้จ่ายประจำของเดือน (ค่าประจำ + หมวดจ่ายเป็นก้อนที่จ่ายทุกเดือน) แยกตามหมวด ใช้กับการ์ดสรุป
    // ค่าใช้จ่ายประจำทั้งเดือน (ไม่รวมงวดผ่อน ซึ่ง route เติมจากรายการผ่อนโดยตรง)
    //  ต่อหมวด: จ่ายแล้ว (ค่าประจำ + หมวดจ่ายก้อน ของเดือนนี้) / คาดว่า = ค่าเฉลี่ยเดิมของส่วนนี้ / รอจ่าย = คาดว่า − จ่ายแล้ว (เฉพาะเดือนปัจจุบัน)
    fixed_month: (() => {
      const isFixedRow = (r) => r.type === 'expense' && !r.inst && (r.fixed || lumpyIds.has(r.category));
      const paid = new Map();
      for (const r of rows) if (isFixedRow(r) && r.iso.slice(0, 7) === key) paid.set(r.category, (paid.get(r.category) || 0) + r.amount);
      const expect = new Map();
      const lastDay = new Map(); // วันที่จ่ายล่าสุดในเดือนอ้างอิง (ใช้บอก "รอจ่ายราววันที่ …")
      if (hasBaseline) {
        for (const r of rows) {
          if (!isFixedRow(r) || !baseUsed.includes(r.iso.slice(0, 7))) continue;
          expect.set(r.category, (expect.get(r.category) || 0) + r.amount / baseN);
          if (!lastDay.has(r.category) || r.iso > lastDay.get(r.category)) lastDay.set(r.category, r.iso);
        }
      }
      const ids = new Set([...paid.keys(), ...(isCurrent ? expect.keys() : [])]);
      const list = [...ids].map((id) => {
        const p = paid.get(id) || 0;
        const e = isCurrent ? expect.get(id) || 0 : 0;
        const pending = isCurrent && e > p * 1.05 && e - p >= 50 ? e - p : 0;
        const day = lastDay.has(id) ? Number(lastDay.get(id).slice(8, 10)) : null;
        return {
          category_id: id, name: catName(id), paid: round0(p), pending: round0(pending), amount: round0(p + pending),
          status: pending > 0 ? (p > 0 ? 'partial' : 'pending') : 'paid',
          due_date: pending > 0 && day ? `${key}-${pad(Math.min(day, dim))}` : null,
        };
      }).filter((c) => c.amount > 0).sort((x, y) => y.amount - x.amount);
      const total = list.reduce((t, c) => t + c.amount, 0);
      const paidTotal = list.reduce((t, c) => t + c.paid, 0);
      const ref = Math.max(cur.income, baseline.avg_income_month || 0);
      const instPaid = round0(rows.filter((r) => r.type === 'expense' && r.inst && r.iso.slice(0, 7) === key).reduce((t, r) => t + r.amount, 0));
      return { total, paid: paidTotal, pending: total - paidTotal, income_ref: ref > 0 ? round0(ref) : null, inst_paid: instPaid, by_category: list.slice(0, 8) };
    })(),
    // ยอดเดือนนี้ที่ไม่นับในการ์ดพฤติกรรม (ค่าประจำ + หมวดจ่ายเป็นก้อน)
    behavior_excluded: round0(rows.filter((r) => r.type === 'expense' && r.iso.slice(0, 7) === key && (r.fixed || lumpyIds.has(r.category))).reduce((t, r) => t + r.amount, 0)),
    biggest,
    projection,
    trend: { months: trendMonths, avg_savings_rate: rates.length ? round1(rates.reduce((a, b) => a + b, 0) / rates.length) : null },
    limits,
  };
}

module.exports = { analyze, THAI_DAYS, BASE_MONTHS, SMALL_AMOUNT, SMALL_DAYS, MIN_DAYS_PROJECTION, ANOMALY_RATIO, ANOMALY_MIN_EXCESS, LUMPY_MAX_COUNT };
