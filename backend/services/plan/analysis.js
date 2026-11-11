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
const LUMPY_MAX_COUNT = 3; // หมวดที่เดือนอ้างอิงมีรายการเฉลี่ยน้อยกว่า 3 รายการต่อเดือน (เช่น ค่าเช่า) ถือว่าจ่ายเป็นก้อน ไม่คิดตามสัดส่วนวัน

const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;
const round0 = (n) => Math.round(Number(n));
const isoOf = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

function emptyMonth() {
  return { income: 0, expense: 0, count: 0, cats: new Map(), catN: new Map() };
}

// txns: [{ date, type, amount, category }] / categories: [{ _id, name, color, type }]
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
    if (type === 'expense') {
      m.cats.set(String(t.category), (m.cats.get(String(t.category)) || 0) + amount);
      m.catN.set(String(t.category), (m.catN.get(String(t.category)) || 0) + 1);
    }
    rows.push({ iso, type, amount, category: String(t.category) });
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
  for (const k of baseUsed) {
    for (const [id, v] of months.get(k).cats) baseCat.set(id, (baseCat.get(id) || 0) + v);
    for (const [id, c] of months.get(k).catN) baseCatN.set(id, (baseCatN.get(id) || 0) + c);
  }
  const hasBaseline = baseN >= 1;
  const baseline = {
    months: baseN,
    avg_expense_month: hasBaseline ? round0(baseExpense / baseN) : null,
    avg_income_month: hasBaseline ? round0(baseIncome / baseN) : null,
    avg_surplus: hasBaseline ? round0((baseIncome - baseExpense) / baseN) : null,
    avg_daily_expense: hasBaseline && baseDays > 0 ? round1(baseExpense / baseDays) : null,
  };

  // ใช้จ่ายเฉลี่ยต่อวัน
  const avgDaily = daysElapsed > 0 ? round1(cur.expense / daysElapsed) : null;
  const pctVsBase = avgDaily !== null && baseline.avg_daily_expense ? round1(((avgDaily - baseline.avg_daily_expense) / baseline.avg_daily_expense) * 100) : null;

  // รายจ่ายตามหมวดเทียบค่าเฉลี่ย (คิดตามสัดส่วนวันที่ผ่านไป)
  const categoriesOut = [...cur.cats.entries()]
    .map(([id, amount]) => {
      const baseAvg = hasBaseline && baseCat.has(id) ? baseCat.get(id) / baseN : null;
      // หมวดที่จ่ายเป็นก้อน (เฉลี่ยน้อยกว่า 3 รายการต่อเดือน) เทียบกับยอดเต็มเดือน หมวดอื่นเทียบตามสัดส่วนวันที่ผ่านไป
      const lumpy = baseAvg !== null && (baseCatN.get(id) || 0) / baseN < LUMPY_MAX_COUNT;
      const expected = baseAvg !== null && daysElapsed > 0 ? (lumpy ? baseAvg : baseAvg * (daysElapsed / dim)) : null;
      const ratio = expected && expected > 0 ? amount / expected : null;
      const excess = expected !== null ? amount - expected : null;
      const flagged = daysElapsed >= MIN_DAYS_PROJECTION && ratio !== null && ratio >= ANOMALY_RATIO && excess >= ANOMALY_MIN_EXCESS;
      return {
        category_id: id,
        name: catName(id),
        color: catColor(id),
        amount: round0(amount),
        share_pct: cur.expense > 0 ? round1((amount / cur.expense) * 100) : 0,
        base_avg: baseAvg !== null ? round0(baseAvg) : null,
        lumpy,
        expected_to_date: expected !== null ? round0(expected) : null,
        pct_vs_expected: ratio !== null ? round1((ratio - 1) * 100) : null,
        excess: excess !== null ? round0(excess) : null,
        flagged,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const anomalies = categoriesOut.filter((c) => c.flagged).sort((a, b) => b.excess - a.excess).slice(0, 3);

  // ค่าเฉลี่ยต่อเดือนรายหมวดของเดือนอ้างอิง (ใช้กับตัวจำลองแผน รวมหมวดที่เดือนนี้ยังไม่มีรายการ)
  const baseCategories = [...baseCat.entries()]
    .map(([id, total]) => ({ category_id: id, name: catName(id), color: catColor(id), base_avg: round0(total / baseN), lumpy: (baseCatN.get(id) || 0) / baseN < LUMPY_MAX_COUNT }))
    .sort((a, b) => b.base_avg - a.base_avg);

  // รูปแบบรายวันของสัปดาห์ (ย้อนหลัง 90 วัน)
  const endIso = isCurrent ? todayIso : `${key}-${pad(dim)}`;
  const wStart = addDaysIso(endIso, -(WEEKDAY_DAYS - 1));
  const wRows = isFuture ? [] : rows.filter((r) => r.type === 'expense' && r.iso >= wStart && r.iso <= endIso);
  const byDay = THAI_DAYS.map((name, day) => ({ day, name, amount: 0 }));
  for (const r of wRows) byDay[new Date(`${r.iso}T00:00:00Z`).getUTCDay()].amount += r.amount;
  const wTotal = byDay.reduce((s, d) => s + d.amount, 0);
  const distinctDays = new Set(wRows.map((r) => r.iso)).size;
  const weekdayReliable = wRows.length >= 20 && distinctDays >= 10 && wTotal > 0;
  byDay.forEach((d) => { d.amount = round0(d.amount); d.share_pct = wTotal > 0 ? round1((d.amount / wTotal) * 100) : 0; });
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
    for (const c of categoriesOut) {
      const raw = cur.cats.get(c.category_id) || 0;
      sum += c.lumpy ? Math.max(raw, baseCat.get(c.category_id) / baseN) : (raw / daysElapsed) * dim;
    }
    for (const [id, total] of baseCat) {
      if (cur.cats.has(id) || (baseCatN.get(id) || 0) / baseN >= LUMPY_MAX_COUNT) continue;
      sum += total / baseN;
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
    daily: { avg: avgDaily, base_avg: baseline.avg_daily_expense, pct_vs_base: pctVsBase },
    baseline,
    categories: categoriesOut,
    base_categories: baseCategories,
    anomalies,
    weekday: { reliable: weekdayReliable, by_day: byDay, peak: peak ? { name: peak.name, share_pct: peak.share_pct } : null, weekend_share_pct: weekendShare },
    small_purchases: small,
    biggest,
    projection,
    trend: { months: trendMonths, avg_savings_rate: rates.length ? round1(rates.reduce((a, b) => a + b, 0) / rates.length) : null },
    limits,
  };
}

module.exports = { analyze, THAI_DAYS, BASE_MONTHS, SMALL_AMOUNT, SMALL_DAYS, MIN_DAYS_PROJECTION, ANOMALY_RATIO, ANOMALY_MIN_EXCESS, LUMPY_MAX_COUNT };
