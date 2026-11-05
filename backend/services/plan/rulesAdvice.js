// คำแนะนำจากกฎ (ไม่ใช้ AI): ใช้เป็นคำแนะนำเริ่มต้น สำรองเมื่อ AI ใช้ไม่ได้ และเป็นข้อความสรุปบนแดชบอร์ด
// ทุกข้อมีตัวเลขที่ใช้ (facts_used) ติดไปด้วยเสมอ
const MAX_ITEMS = 4;

const num = (n) => {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString('en-US') : r.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// current = false เมื่อดูเดือนที่ผ่านมา: ใช้ถ้อยคำของเรื่องที่จบแล้ว (ไม่มี "ถ้าใช้จ่ายในอัตรานี้" / "ลองวางแผนล่วงหน้า") และไม่มีเรื่องเป้าหมาย
function rulesAdvice(facts, goalEvalsIn = [], { current = true } = {}) {
  const when = current ? 'เดือนนี้' : 'เดือนนั้น';
  const goalEvals = current ? goalEvalsIn : []; // เป้าหมายเป็นเรื่องของตอนนี้ ไม่พูดถึงในเดือนที่ผ่านมา
  const byId = new Map(facts.map((f) => [f.id, f]));
  const val = (id) => (byId.has(id) ? byId.get(id).value : null);
  const use = (...ids) => ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const items = [];
  const push = (tag, text, ids) => { if (items.length < MAX_ITEMS) items.push({ tag, text, facts_used: use(...ids), source: 'rules' }); };

  // 1) คาดการณ์รายจ่ายสิ้นเดือนสูงกว่ารายรับอ้างอิง
  if (current && val('projection') !== null && val('income_ref') !== null && val('projection') > val('income_ref')) {
    push('warning', `ถ้าใช้จ่ายในอัตรานี้ รายจ่ายสิ้นเดือนจะอยู่ราว ${num(val('projection'))} บาท สูงกว่ารายรับอ้างอิง ${num(val('income_ref'))} บาท ลองทบทวนรายการที่ลดได้ก่อนสิ้นเดือน`, ['projection', 'income_ref', 'projection_pct']);
  } else if (!current && val('expense_month') !== null && val('income_ref') !== null && val('expense_month') > val('income_ref')) {
    push('warning', `รายจ่าย${when}อยู่ที่ ${num(val('expense_month'))} บาท สูงกว่ารายรับอ้างอิง ${num(val('income_ref'))} บาท ลองดูว่ามีรายการที่ลดได้ในเดือนถัดไปไหม`, ['expense_month', 'income_ref', 'projection_pct']);
  }
  // 2) หมวดที่สูงผิดปกติ (ข้อที่เกินมากที่สุด)
  if (val('cat0_amount') !== null) {
    const nm = byId.get('cat0_amount').label.replace(/^หมวด “/, '').replace(/” เดือน(นี้|นั้น)$/, '');
    push('warning', `หมวด “${nm}” ${when} ${num(val('cat0_amount'))} บาท สูงกว่าค่าเฉลี่ยของคุณ (${num(val('cat0_base'))} บาท) อยู่ ${num(val('cat0_pct'))}% ลองดูรายการในหมวดนี้ว่ามีอะไรลดหรือเลื่อนได้บ้าง`, ['cat0_amount', 'cat0_base', 'cat0_pct']);
  }
  // 3) เป้าหมายที่ยังไม่ทัน
  const behind = goalEvals.findIndex((g) => g.status === 'behind');
  if (behind >= 0 && behind < 3 && val(`g${behind}_required`) !== null) {
    const g = goalEvals[behind];
    push('goal', `เป้าหมาย “${g.name}” ต้องออมเดือนละ ${num(val(`g${behind}_required`))} บาท แต่เงินเหลือเฉลี่ยต่อเดือนของคุณอยู่ที่ ${num(val(`g${behind}_capacity`))} บาท ถ้าแบ่งมาออมทั้งหมดจะช้ากว่ากำหนดราว ${num(val(`g${behind}_delay`))} เดือน ลองดูรายจ่ายหมวดที่สูงว่าลดหรือเลื่อนได้บ้างไหม`, [`g${behind}_required`, `g${behind}_capacity`, `g${behind}_delay`]);
  } else {
    const noSur = goalEvals.findIndex((g) => g.status === 'no_surplus');
    if (noSur >= 0 && noSur < 3) push('goal', `ช่วง 3 เดือนที่ผ่านมารายจ่ายไม่ต่ำกว่ารายรับ จึงยังออมเพื่อเป้าหมาย “${goalEvals[noSur].name}” ไม่ได้ ลองลดรายจ่ายบางหมวดก่อน`, [`g${noSur}_remaining`, 'avg_surplus']);
  }
  // 4) รายจ่ายเล็ก ๆ ถี่ ๆ
  if (val('small_count') !== null && val('small_count') >= 15 && val('small_total') !== null) {
    push('tip', current
      ? `รายจ่ายน้อยกว่า 100 บาทมี ${num(val('small_count'))} ครั้งใน 30 วัน รวม ${num(val('small_total'))} บาท ลองดูว่ามีรายการที่รวมหรือลดได้ไหม`
      : `ก่อนสิ้นเดือนนั้น รายจ่ายน้อยกว่า 100 บาทมี ${num(val('small_count'))} ครั้ง รวม ${num(val('small_total'))} บาท`, ['small_count', 'small_total']);
  }
  // 5) วันที่ใช้จ่ายสูงสุดของสัปดาห์
  if (val('peak_day') !== null && val('peak_share') !== null && val('peak_share') >= 20) {
    push('tip', current
      ? `วัน${val('peak_day')}เป็นวันที่คุณใช้จ่ายมากที่สุด คิดเป็น ${num(val('peak_share'))}% ของรายจ่ายรายสัปดาห์ ลองวางแผนล่วงหน้าสำหรับวันนี้`
      : `ช่วงก่อนสิ้นเดือนนั้น วัน${val('peak_day')}เป็นวันที่คุณใช้จ่ายมากที่สุด คิดเป็น ${num(val('peak_share'))}% ของรายจ่ายรายสัปดาห์`, ['peak_day', 'peak_share']);
  }
  // 6) ข้อดีที่ควรรักษาไว้
  if (items.length < MAX_ITEMS && val('savings_rate') !== null && val('savings_rate') >= 20) {
    push('tip', current ? `อัตราการออมเดือนนี้ ${num(val('savings_rate'))}% อยู่ในเกณฑ์ดี ลองรักษาระดับนี้ไว้` : `อัตราการออมเดือนนั้น ${num(val('savings_rate'))}% อยู่ในเกณฑ์ดี`, ['savings_rate']);
  }
  const ontrack = goalEvals.findIndex((g) => g.status === 'on_track');
  if (items.length < MAX_ITEMS && ontrack >= 0 && ontrack < 3 && val(`g${ontrack}_required`) !== null) {
    push('goal', `เป้าหมาย “${goalEvals[ontrack].name}” อยู่ในเส้นทาง ต้องออมเดือนละ ${num(val(`g${ontrack}_required`))} บาท และเงินเหลือเฉลี่ยต่อเดือนของคุณอยู่ที่ ${num(val(`g${ontrack}_capacity`))} บาท ซึ่งพอสำหรับเป้าหมายนี้`, [`g${ontrack}_required`, `g${ontrack}_capacity`]);
  }
  if (items.length === 0) {
    push('tip', 'ยังไม่มีข้อมูลเพียงพอสำหรับคำแนะนำ ลองบันทึกรายการต่อเนื่องอีกสักระยะ ระบบจะเริ่มเทียบกับค่าเฉลี่ยของคุณได้', []);
  }
  return items;
}

module.exports = { rulesAdvice, MAX_ITEMS };
