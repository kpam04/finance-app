// รวม "ข้อเท็จจริง" (id, ป้าย, ค่า, หน่วย) จากผลวิเคราะห์ + เป้าหมาย + รายการผ่อน ใช้ทั้งกับคำแนะนำจากกฎและส่งให้ AI เขียนคำอธิบาย
// ตัวเลขทุกตัวมาจากที่นี่ AI ไม่มีสิทธิ์สร้างตัวเลขเอง (ระบบตรวจย้อนกลับทุกครั้ง)
// short = ชื่อสั้นสำหรับป้ายตัวเลขใต้คำแนะนำ (เช่น "อาหาร" "เฉลี่ย") ใช้เฉพาะแสดงผล ไม่ส่งให้ AI (ป้ายเต็ม label ยังใช้เป็นคำอธิบายเมื่อชี้)
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// "2027-03-15" -> "มี.ค. 2570"
function thaiMonthYear(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  if (!y || !m) return '';
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

const clip = (s, n) => Array.from(String(s || '')).slice(0, n).join('');

// goalEvals: [{ goal_id, name, target_date, ...ผลประเมินจาก evaluateGoal }]
// inst (เฉพาะเดือนปัจจุบัน): { load, burden_pct, free: { amount, month, n, name } | null } จาก installmentFacts
function buildFacts(analysis, goalEvals = [], inst = null) {
  const facts = [];
  const add = (id, label, value, unit = '', short = null, extra = null) => {
    if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return;
    facts.push({ id, label, value, unit, ...(short !== null ? { short } : {}), ...(extra || {}) });
  };
  const n = analysis.baseline.months;
  const baseLabel = `${n} เดือนก่อน`;
  const current = analysis.is_current !== false; // ดูเดือนที่ผ่านมา: ใช้คำว่า "เดือนนั้น" และไม่มี "คาดการณ์" (ยอดทั้งเดือนคือยอดจริง)
  const when = current ? 'เดือนนี้' : 'เดือนนั้น';

  add('expense_month', `รายจ่าย${when}`, analysis.totals.expense, 'บาท', `รายจ่าย${when}`);
  add('income_month', `รายรับ${when}`, analysis.totals.income, 'บาท', `รายรับ${when}`);
  add('savings_rate', `อัตราการออม${when}`, analysis.totals.savings_rate, '%', 'อัตราการออม');
  const exLumpy = analysis.daily.excludes_lumpy ? ' ไม่รวมค่าประจำและรายจ่ายก้อน' : '';
  add('avg_daily', `ใช้จ่ายเฉลี่ยต่อวัน (${when}${exLumpy})`, analysis.daily.avg, 'บาท', 'เฉลี่ย/วัน');
  add('avg_daily_base', `ใช้จ่ายเฉลี่ยต่อวัน (${baseLabel}${exLumpy})`, analysis.daily.base_avg, 'บาท', 'เฉลี่ยเดิม/วัน');
  add('avg_daily_pct', 'ใช้จ่ายต่อวันเทียบกับค่าเฉลี่ยเดิม', analysis.daily.pct_vs_base, '%', '');
  if (current) add('projection', 'คาดการณ์รายจ่ายสิ้นเดือน', analysis.projection.expense_end, 'บาท', 'คาดการณ์');
  add('income_ref', 'รายรับอ้างอิงของเดือน', analysis.projection.income_ref, 'บาท', 'รายรับอ้างอิง');
  add('projection_pct', current ? 'คาดการณ์รายจ่ายเทียบกับรายรับอ้างอิง' : 'รายจ่ายเทียบกับรายรับอ้างอิง', analysis.projection.pct_of_income, '%', 'เทียบรายรับ');
  // เดือนปัจจุบัน: อัตราการออมที่คาดว่าจะเหลือตอนสิ้นเดือน (ยอดถึงวันนี้ยังไม่สะท้อน เพราะรายรับมักเข้าต้นเดือน แต่รายจ่ายยังทยอยมา)
  if (current && analysis.projection.pct_of_income !== null && analysis.projection.pct_of_income !== undefined) add('save_pct_proj', 'คาดว่าจะเหลือเก็บสิ้นเดือน (% ของรายรับอ้างอิง)', Math.round((100 - analysis.projection.pct_of_income) * 10) / 10, '%', 'คาดเหลือเก็บ');
  add('avg_surplus', `เงินเหลือเฉลี่ยต่อเดือน (${baseLabel})`, analysis.baseline.avg_surplus, 'บาท', 'เหลือเฉลี่ย/เดือน');
  analysis.anomalies.forEach((c, i) => {
    const nm = clip(c.name, 30);
    const sn = clip(c.name, 14);
    add(`cat${i}_amount`, `หมวด “${nm}” ${when}`, c.amount, 'บาท', sn);
    // หมวดจ่ายเป็นก้อนเทียบค่าเฉลี่ยทั้งเดือน / หมวดทั่วไปเทียบระดับปกติถึงวันนี้ (ป้ายสั้นต่างกัน จะได้ไม่สับสน)
    add(`cat${i}_base`, c.lumpy ? `หมวด “${nm}” ค่าเฉลี่ยทั้งเดือน` : `หมวด “${nm}” ระดับปกติถึงวันนี้ (ค่าเฉลี่ยตามสัดส่วนวัน)`, c.expected_to_date, 'บาท', c.lumpy ? 'เฉลี่ย/เดือน' : 'ปกติถึงวันนี้');
    add(`cat${i}_pct`, `หมวด “${nm}” สูงกว่าปกติ`, c.pct_vs_expected, '%', '');
  });
  if (analysis.special && analysis.special.total > 0) {
    add('special_total', `รายจ่ายพิเศษ${when} (รายการก้อนใหญ่ที่ไม่ได้เกิดเป็นประจำ)`, analysis.special.total, 'บาท', 'รายจ่ายพิเศษ');
    add('special_count', `จำนวนรายจ่ายพิเศษ${when}`, analysis.special.items.length, 'รายการ', 'จำนวน');
  }
  if (analysis.weekday.peak) {
    add('peak_day', 'วันที่ใช้จ่ายมากที่สุดของสัปดาห์', analysis.weekday.peak.name, '', 'วันสูงสุด');
    add('peak_share', 'สัดส่วนรายจ่ายของวันนั้น', analysis.weekday.peak.share_pct, '%', 'สัดส่วน');
  }
  const sp = analysis.small_purchases;
  if (sp.count > 0) {
    add('small_count', `รายจ่ายน้อยกว่า ${sp.threshold} บาท ใน ${sp.days} วัน`, sp.count, 'ครั้ง', 'รายจ่ายเล็ก');
    add('small_total', `ยอดรวมรายจ่ายน้อยกว่า ${sp.threshold} บาท ใน ${sp.days} วัน`, sp.total, 'บาท', 'รวม');
  }
  goalEvals.slice(0, 3).forEach((g, i) => {
    const nm = clip(g.name, 30);
    add(`g${i}_remaining`, `เป้าหมาย “${nm}” ยังขาดอีก`, g.remaining, 'บาท', 'ขาดอีก');
    add(`g${i}_date`, `เป้าหมาย “${nm}” อยากถึงภายใน`, thaiMonthYear(g.target_date), '', 'ภายใน');
    add(`g${i}_required`, `เป้าหมาย “${nm}” ต้องออมต่อเดือน`, g.required_monthly, 'บาท', 'ต้องออม/เดือน');
    add(`g${i}_capacity`, `เป้าหมาย “${nm}” เงินเหลือเฉลี่ยต่อเดือน (ถ้าแบ่งมาออมได้)`, g.capacity_monthly, 'บาท', 'เงินเหลือเฉลี่ย');
    add(`g${i}_delay`, `เป้าหมาย “${nm}” จะช้ากว่ากำหนด`, g.delay_months, 'เดือน', 'ช้ากว่า');
    if (g.eta_date) add(`g${i}_eta`, `เป้าหมาย “${nm}” คาดว่าจะถึงเมื่อ`, thaiMonthYear(g.eta_date), '', 'คาดถึง');
  });
  if (current && inst) {
    if (inst.load > 0) add('inst_load', 'ภาระผ่อนต่อเดือน (ทุกรายการที่กำลังผ่อน)', inst.load, 'บาท', 'ผ่อน/เดือน');
    if (inst.load > 0) add('inst_burden_pct', 'ภาระผ่อนเทียบกับรายรับอ้างอิง', inst.burden_pct, '%', 'ของรายรับ');
    if (inst.free) {
      add('inst_free', 'เงินที่จะเหลือเพิ่มต่อเดือนหลังผ่อนจบ (รายการที่จบภายใน 2 เดือน)', inst.free.amount, 'บาท', 'เหลือเพิ่ม/เดือน');
      add('inst_free_month', 'เริ่มมีเงินเหลือเพิ่มตั้งแต่', thaiMonthYear(`${inst.free.month}-01`), '', 'ตั้งแต่');
      add('inst_free_n', 'จำนวนรายการผ่อนที่จะจบภายใน 2 เดือน', inst.free.n, 'รายการ', 'จบ');
      if (inst.free.n === 1) add('inst_free_name', 'รายการผ่อนที่จะจบ', clip(inst.free.name, 30), '', 'รายการ', { ai: false });
    }
  }
  return facts;
}

module.exports = { buildFacts, thaiMonthYear, THAI_MONTHS };
