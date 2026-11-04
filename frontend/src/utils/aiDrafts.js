// แปลงรายการที่ AI สกัด (จากหลังบ้าน) เป็น "ร่าง" รูปแบบเดียวกับตัวแยกข้อความแบบกฎ เพื่อใช้หน้ายืนยันเดิม
// ฟิลด์ ai = ข้อมูลเพิ่มสำหรับหน้ายืนยัน (ความมั่นใจ ธงที่ AI ไม่แน่ใจ รหัสเหตุการณ์ไว้รายงานผลตอบรับ)
export function itemsToDrafts(items, { rawText, inputSource, eventId, model, redactions }) {
  return items.map((it, index) => {
    const flags = it.flags || {};
    const sure = it.confidence >= 0.8 && !flags.category_guessed && !flags.date_defaulted;
    return {
      type: it.type,
      amount: it.amount,
      category_id: it.category_id || '',
      category_name: it.category_name || '',
      note: it.note || '',
      transaction_date: it.transaction_date,
      confidence: sure ? 'high' : 'medium',
      raw_text: rawText,
      ...(inputSource === 'voice' ? { source: 'voice' } : {}),
      ai: { confidence: it.confidence, event_id: eventId, index, total: items.length, model, flags, redactions },
    };
  });
}

// ผู้ใช้แก้ฟิลด์ไหนจากที่ AI สกัดให้ (ใช้รายงานผลตอบรับ ไม่ส่งเนื้อหา)
export function editedFields(draft, data) {
  return {
    amount: Number(draft.amount) !== Number(data.amount),
    category: String(draft.category_id || '') !== String(data.category_id || ''),
    date: String(draft.transaction_date || '') !== String(data.transaction_date || ''),
    type: String(draft.type || '') !== String(data.type || ''),
    note: String(draft.note || '').trim() !== String(data.note || '').trim(),
  };
}

// ข้อความอธิบายเมื่อต้องถอยไปใช้การแยกแบบกฎ
export const FALLBACK_REASON = {
  AI_QUOTA: 'ใช้ AI ครบโควต้าของวันนี้แล้ว',
  AI_RATE: 'ใช้ AI ถี่เกินไป',
  AI_BUSY: 'ระบบ AI ถูกใช้งานหนาแน่น',
  AI_BAD_OUTPUT: 'AI ตอบกลับในรูปแบบที่ใช้ไม่ได้',
  AI_UNAVAILABLE: 'ระบบ AI ใช้ไม่ได้ชั่วคราว',
  AI_EMPTY: 'AI ไม่พบรายการในข้อความนี้',
  AI_CONSENT_REQUIRED: 'ยังไม่ได้เปิดใช้ AI',
};
export const fallbackReasonFor = (err) => FALLBACK_REASON[err && err.code] || 'ระบบ AI ใช้ไม่ได้ชั่วคราว';

const TYPE_TH = { expense: 'รายจ่าย', income: 'รายรับ' };
const fmtDateTh = (iso) => {
  const t = new Date(`${iso}T00:00:00`);
  return Number.isNaN(t.getTime()) ? String(iso || '-') : t.toLocaleDateString('th-TH', { dateStyle: 'medium' });
};
const fmtAmount = (v) => (Number.isFinite(Number(v)) && v !== '' ? `${Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท` : '-');

// เทียบ "ค่าในฟอร์มตอนนี้" กับรายการแรกที่ AI สกัดได้
// diff = ฟิลด์ที่ต่างกัน (ส่งหลังบ้านเป็นสถิติ) / rows = แถวไว้แสดงให้ผู้ใช้ดู / keyCount = จำนวนฟิลด์หลักที่ต่าง (ไม่นับบันทึกช่วยจำ เพราะถ้อยคำต่างกันได้เป็นปกติ)
export function compareWithAi(form, aiItem, categories = []) {
  const catName = (id) => {
    const c = categories.find((x) => String(x.category_id) === String(id));
    return c ? c.name : '';
  };
  const diff = {
    type: String(form.type || '') !== String(aiItem.type || ''),
    amount: Number(form.amount) !== Number(aiItem.amount),
    category: String(form.category_id || '') !== String(aiItem.category_id || ''),
    date: String(form.transaction_date || '') !== String(aiItem.transaction_date || ''),
    note: String(form.note || '').replace(/\s+/g, '').toLowerCase() !== String(aiItem.note || '').replace(/\s+/g, '').toLowerCase(),
  };
  const rows = [];
  if (diff.type) rows.push({ key: 'type', label: 'ประเภท', cur: TYPE_TH[form.type] || '-', ai: TYPE_TH[aiItem.type] || '-' });
  if (diff.amount) rows.push({ key: 'amount', label: 'จำนวนเงิน', cur: fmtAmount(form.amount), ai: fmtAmount(aiItem.amount) });
  if (diff.category) rows.push({ key: 'category', label: 'หมวดหมู่', cur: catName(form.category_id) || '(ยังไม่เลือก)', ai: aiItem.category_name || '(ไม่มีหมวดที่ตรง)' });
  if (diff.date) rows.push({ key: 'date', label: 'วันที่', cur: fmtDateTh(form.transaction_date), ai: fmtDateTh(aiItem.transaction_date) });
  if (diff.note) rows.push({ key: 'note', label: 'บันทึก', cur: String(form.note || '').trim() || '-', ai: String(aiItem.note || '').trim() || '-', minor: true });
  const keyCount = ['type', 'amount', 'category', 'date'].filter((k) => diff[k]).length;
  return { diff, rows, keyCount };
}
