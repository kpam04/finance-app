// คำแนะนำจากกฎ (ไม่ใช้ AI): ใช้เป็นคำแนะนำเริ่มต้น สำรองเมื่อ AI ใช้ไม่ได้ และเป็นข้อความสรุปบนแดชบอร์ด
// ทุกข้อมีตัวเลขที่ใช้ (facts_used) ติดไปด้วยเสมอ
// group = ประเภทสำหรับปุ่มกรอง: watch (ระวัง) / save (โอกาสออม) / good (ทำได้ดี) เรียง watch → save → good
const MAX_ITEMS = 6;
const GROUP_CAP = { watch: 3, save: 2, good: 2 };
const GROUP_ORDER = ['watch', 'save', 'good'];
const BURDEN_WARN_PCT = 30; // ภาระผ่อนเกิน 30% ของรายรับ = ควรระวังก่อนผ่อนเพิ่ม
const DAILY_GOOD_PCT = -10; // ใช้จ่ายต่อวันต่ำกว่าค่าเฉลี่ยเดิมตั้งแต่ 10% = ทำได้ดี

const num = (n) => {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? r.toLocaleString('en-US') : r.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

// current = false เมื่อดูเดือนที่ผ่านมา: ใช้ถ้อยคำของเรื่องที่จบแล้ว (ไม่มี "ถ้าใช้จ่ายในอัตรานี้" / "ลองวางแผนล่วงหน้า") และไม่มีเรื่องเป้าหมาย/ผ่อน
function rulesAdvice(facts, goalEvalsIn = [], { current = true } = {}) {
  const when = current ? 'เดือนนี้' : 'เดือนนั้น';
  const goalEvals = current ? goalEvalsIn : []; // เป้าหมายเป็นเรื่องของตอนนี้ ไม่พูดถึงในเดือนที่ผ่านมา
  const byId = new Map(facts.map((f) => [f.id, f]));
  const val = (id) => (byId.has(id) ? byId.get(id).value : null);
  const use = (...ids) => ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
  const cands = [];
  const push = (group, tag, text, ids) => cands.push({ tag, group, text, facts_used: use(...ids), source: 'rules' });

  // ---------- ระวัง ----------
  if (current && val('projection') !== null && val('income_ref') !== null && val('projection') > val('income_ref')) {
    push('watch', 'warning', `ถ้าใช้จ่ายในอัตรานี้ รายจ่ายสิ้นเดือนจะอยู่ราว ${num(val('projection'))} บาท สูงกว่ารายรับอ้างอิง ${num(val('income_ref'))} บาท ลองทบทวนรายการที่ลดได้ก่อนสิ้นเดือน`, ['projection', 'income_ref', 'projection_pct']);
  } else if (!current && val('expense_month') !== null && val('income_ref') !== null && val('expense_month') > val('income_ref')) {
    push('watch', 'warning', `รายจ่าย${when}อยู่ที่ ${num(val('expense_month'))} บาท สูงกว่ารายรับอ้างอิง ${num(val('income_ref'))} บาท ลองดูว่ามีรายการที่ลดได้ในเดือนถัดไปไหม`, ['expense_month', 'income_ref', 'projection_pct']);
  }
  // หมวดที่สูงผิดปกติ (สูงสุด 2 หมวด เรียงตามยอดที่เกิน)
  for (let i = 0; i < 2; i += 1) {
    if (val(`cat${i}_amount`) === null) continue;
    const nm = byId.get(`cat${i}_amount`).label.replace(/^หมวด “/, '').replace(/” เดือน(นี้|นั้น)$/, '');
    const lumpy = /ค่าเฉลี่ยทั้งเดือน$/.test(byId.get(`cat${i}_base`).label);
    // ยอดที่จ่ายไปแล้วลดย้อนหลังไม่ได้: แนะนำสิ่งที่ยังทำได้ (ช่วงที่เหลือของเดือน / เดือนหน้า)
    const tail = !current ? 'ลองดูว่าเดือนถัดไปมีอะไรลดหรือเลื่อนได้บ้าง'
      : lumpy ? 'ช่วงที่เหลือของเดือนลองชะลอหมวดนี้ไว้ก่อน และตั้งงบไว้สำหรับเดือนหน้า'
        : 'ช่วงที่เหลือของเดือนลองดูว่ามีรายการในหมวดนี้ที่ลดหรือเลื่อนได้บ้าง';
    push('watch', 'warning', `หมวด “${nm}” ${when} ${num(val(`cat${i}_amount`))} บาท สูงกว่า${lumpy ? 'ค่าเฉลี่ยต่อเดือน' : 'ระดับปกติถึงวันนี้'}ของคุณ (${num(val(`cat${i}_base`))} บาท) ${val(`cat${i}_pct`) >= 100 ? `ราว ${num(1 + val(`cat${i}_pct`) / 100)} เท่า` : `อยู่ ${num(val(`cat${i}_pct`))}%`} ${tail}`, [`cat${i}_amount`, `cat${i}_base`, `cat${i}_pct`]);
  }
  // เป้าหมายที่ยังไม่ทัน
  const behind = goalEvals.findIndex((g) => g.status === 'behind');
  if (behind >= 0 && behind < 3 && val(`g${behind}_required`) !== null) {
    const g = goalEvals[behind];
    push('watch', 'goal', `เป้าหมาย “${g.name}” ต้องออมเดือนละ ${num(val(`g${behind}_required`))} บาท แต่เงินเหลือเฉลี่ยต่อเดือนของคุณอยู่ที่ ${num(val(`g${behind}_capacity`))} บาท ถ้าแบ่งมาออมทั้งหมดจะช้ากว่ากำหนดราว ${num(val(`g${behind}_delay`))} เดือน ลองปรับรายจ่ายบางหมวดดูว่าจะทันขึ้นไหม`, [`g${behind}_required`, `g${behind}_capacity`, `g${behind}_delay`]);
  } else {
    const noSur = goalEvals.findIndex((g) => g.status === 'no_surplus');
    if (noSur >= 0 && noSur < 3) push('watch', 'goal', `ช่วง 3 เดือนที่ผ่านมารายจ่ายไม่ต่ำกว่ารายรับ จึงยังออมเพื่อเป้าหมาย “${goalEvals[noSur].name}” ไม่ได้ ลองลดรายจ่ายบางหมวดก่อน`, [`g${noSur}_remaining`, 'avg_surplus']);
  }
  // ภาระผ่อนสูง
  if (current && val('inst_burden_pct') !== null && val('inst_burden_pct') > BURDEN_WARN_PCT) {
    push('watch', 'warning', `ภาระผ่อนต่อเดือน ${num(val('inst_load'))} บาท คิดเป็น ${num(val('inst_burden_pct'))}% ของรายรับอ้างอิง ซึ่งค่อนข้างสูง ลองชะลอการผ่อนรายการใหม่ไว้ก่อนจนกว่าบางรายการจะผ่อนจบ`, ['inst_load', 'inst_burden_pct']);
  }

  // ---------- โอกาสออม ----------
  // รายจ่ายพิเศษ (ค่าเทอม คอนเสิร์ต ฯลฯ): ชวนเตรียมเงินล่วงหน้าสำหรับครั้งหน้า
  if (val('special_total') !== null) {
    push('save', 'tip', current
      ? `${when}มีรายจ่ายพิเศษ ${num(val('special_count'))} รายการ รวม ${num(val('special_total'))} บาท ถ้าเป็นรายจ่ายที่รู้ล่วงหน้า เช่น ค่าเทอม ลองตั้งเป้าหมายออมทยอยเก็บไว้ ครั้งหน้าจะไม่กระทบเงินเดือนก้อนเดียว`
      : `${when}มีรายจ่ายพิเศษ ${num(val('special_count'))} รายการ รวม ${num(val('special_total'))} บาท ถ้ามีรายจ่ายแบบนี้อีก ลองทยอยเก็บเงินไว้ล่วงหน้า`, ['special_total', 'special_count']);
  }
  if (current && val('inst_free') !== null) {
    const n = val('inst_free_n');
    const what = n > 1 ? `รายการผ่อน ${num(n)} รายการ ` : `“${val('inst_free_name')}” `;
    push('save', 'tip', `${what}จะผ่อนจบเร็ว ๆ นี้ ตั้งแต่ ${val('inst_free_month')} จะมีเงินเหลือเพิ่มราวเดือนละ ${num(val('inst_free'))} บาท ลองตั้งเป้าหมายออมด้วยเงินส่วนนี้ไว้ก่อน`, ['inst_free', 'inst_free_month', 'inst_free_name']);
  }
  if (val('small_count') !== null && val('small_count') >= 15 && val('small_total') !== null) {
    push('save', 'tip', current
      ? `รายจ่ายน้อยกว่า 100 บาทมี ${num(val('small_count'))} ครั้งใน 30 วัน รวม ${num(val('small_total'))} บาท ลองดูว่ามีรายการที่รวมหรือลดได้ไหม`
      : `ก่อนสิ้นเดือนนั้น รายจ่ายน้อยกว่า 100 บาทมี ${num(val('small_count'))} ครั้ง รวม ${num(val('small_total'))} บาท`, ['small_count', 'small_total']);
  }
  if (val('peak_day') !== null && val('peak_share') !== null && val('peak_share') >= 20) {
    push('save', 'tip', current
      ? `วัน${val('peak_day')}เป็นวันที่คุณใช้จ่ายมากที่สุด คิดเป็น ${num(val('peak_share'))}% ของรายจ่ายรายสัปดาห์ ลองวางแผนล่วงหน้าสำหรับวันนี้`
      : `ช่วงก่อนสิ้นเดือนนั้น วัน${val('peak_day')}เป็นวันที่คุณใช้จ่ายมากที่สุด คิดเป็น ${num(val('peak_share'))}% ของรายจ่ายรายสัปดาห์`, ['peak_day', 'peak_share']);
  }

  // ---------- ทำได้ดี ----------
  // เดือนปัจจุบันดูจากที่คาดว่าจะเหลือสิ้นเดือน (ไม่ใช้ยอดถึงวันนี้ ซึ่งดูดีเกินจริงช่วงต้นเดือน)
  if (current && val('save_pct_proj') !== null && val('save_pct_proj') >= 20) {
    push('good', 'tip', `ถ้าใช้จ่ายในอัตรานี้ สิ้นเดือนคาดว่าจะเหลือเก็บราว ${num(val('save_pct_proj'))}% ของรายรับ อยู่ในเกณฑ์ดี ลองรักษาระดับนี้ไว้`, ['save_pct_proj']);
  } else if (!current && val('savings_rate') !== null && val('savings_rate') >= 20) {
    push('good', 'tip', `อัตราการออมเดือนนั้น ${num(val('savings_rate'))}% อยู่ในเกณฑ์ดี`, ['savings_rate']);
  }
  if (val('avg_daily_pct') !== null && val('avg_daily_pct') <= DAILY_GOOD_PCT) {
    push('good', 'tip', `${when}ใช้จ่ายเฉลี่ยวันละ ${num(val('avg_daily'))} บาท ต่ำกว่าค่าเฉลี่ยเดิม (${num(val('avg_daily_base'))} บาท) อยู่ ${num(Math.abs(val('avg_daily_pct')))}% ทำได้ดีมาก`, ['avg_daily', 'avg_daily_base', 'avg_daily_pct']);
  }
  const ontrack = goalEvals.findIndex((g) => g.status === 'on_track');
  if (ontrack >= 0 && ontrack < 3 && val(`g${ontrack}_required`) !== null) {
    push('good', 'goal', `เป้าหมาย “${goalEvals[ontrack].name}” อยู่ในเส้นทาง ต้องออมเดือนละ ${num(val(`g${ontrack}_required`))} บาท และเงินเหลือเฉลี่ยต่อเดือนของคุณอยู่ที่ ${num(val(`g${ontrack}_capacity`))} บาท ซึ่งพอสำหรับเป้าหมายนี้`, [`g${ontrack}_required`, `g${ontrack}_capacity`]);
  }

  // เลือกตามโควตาของแต่ละประเภท (ให้มีข้อดีด้วยเสมอถ้ามี ไม่ใช่มีแต่ข้อเตือน)
  const used = { watch: 0, save: 0, good: 0 };
  const items = [];
  for (const g of GROUP_ORDER) {
    for (const c of cands) {
      if (c.group !== g || used[g] >= GROUP_CAP[g] || items.length >= MAX_ITEMS) continue;
      used[g] += 1;
      items.push(c);
    }
  }
  if (items.length === 0) {
    items.push({ tag: 'tip', group: 'save', text: 'ยังไม่มีข้อมูลเพียงพอสำหรับคำแนะนำ ลองบันทึกรายการต่อเนื่องอีกสักระยะ ระบบจะเริ่มเทียบกับค่าเฉลี่ยของคุณได้', facts_used: [], source: 'rules' });
  }
  return items;
}

module.exports = { rulesAdvice, MAX_ITEMS, BURDEN_WARN_PCT, GROUP_ORDER };
