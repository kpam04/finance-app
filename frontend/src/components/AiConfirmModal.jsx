import { useState } from 'react';
import CategorySelect from './CategorySelect.jsx';
import ReceiptPanel from './ReceiptPanel.jsx';

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const box = {
  background: '#fff', borderRadius: 14, padding: 22, width: 520, maxWidth: '100%',
  maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
};
const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const field = { width: '100%', boxSizing: 'border-box' };
const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };

// สีป้ายความมั่นใจของ AI: เขียว (>= 80%) เหลือง (>= 50%) แดง (ต่ำกว่านั้น)
const confTone = (c) => (c >= 0.8 ? { bg: '#ecfdf5', fg: '#065f46', label: 'มั่นใจ' } : c >= 0.5 ? { bg: '#fef3c7', fg: '#92400e', label: 'ค่อนข้างมั่นใจ' } : { bg: '#fee2e2', fg: '#991b1b', label: 'ไม่ค่อยมั่นใจ' });
const warnRing = { boxShadow: '0 0 0 2px #fbbf24', borderRadius: 8 };
const hint = { fontSize: 12, color: '#b45309', marginTop: 4 };

// AI วิเคราะห์ข้อความก่อนเปิดการ์ดนี้แล้ว (ถ้า AI ใช้ไม่ได้ ร่างมาจากกฎพร้อมเหตุผล fallback_reason) การ์ดนี้จึงไม่มีปุ่มเรียก AI ซ้ำ
export default function AiConfirmModal({ draft, categories, onConfirm, onClose, onSkip, onCategoryCreated }) {
  const [form, setForm] = useState({
    type: draft.type || 'expense',
    category_id: draft.category_id || '',
    amount: draft.amount === '' || draft.amount == null ? '' : String(draft.amount),
    transaction_date: draft.transaction_date,
    note: draft.note || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // ข้อมูลจาก AI: ความมั่นใจ ลำดับในชุด (กรณีข้อความเดียวมีหลายรายการ) และฟิลด์ที่ AI ไม่แน่ใจ (ธงหายเมื่อผู้ใช้แก้ฟิลด์นั้นแล้ว)
  const ai = draft.ai || null;
  const total = ai ? ai.total : 1;
  const tone = ai ? confTone(ai.confidence) : null;
  const flagCategory = !!ai && ai.flags.category_guessed && form.category_id === (draft.category_id || '');
  const flagDate = !!ai && ai.flags.date_defaulted && form.transaction_date === draft.transaction_date;
  const isReceipt = !!draft.receipt; // ร่างที่ได้จากการสแกนใบเสร็จ (แสดงแผงใบเสร็จ รูปย่อ และธงเตือนเฉพาะใบเสร็จ)
  const amountUntouched = form.amount === (draft.amount === '' || draft.amount == null ? '' : String(draft.amount));
  const amountFlag = !ai ? null : ai.flags.total_mismatch ? 'mismatch' : ai.flags.amount_from_items ? 'items' : ai.confidence < 0.6 ? 'low' : null;
  const flagAmount = !!amountFlag && amountUntouched;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (!form.category_id) return setError('กรุณาเลือกหมวดหมู่');
    if (!(amount > 0)) return setError('กรุณากรอกจำนวนเงินให้ถูกต้อง');

    setBusy(true);
    try {
      await onConfirm({
        type: form.type,
        category_id: form.category_id,
        amount,
        transaction_date: form.transaction_date,
        note: form.note.trim(),
      });
    } catch (err) {
      setError(err.message || 'บันทึกรายการไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🤖 ตรวจสอบก่อนบันทึก</h3>

        {total > 1 && (
          <div data-queue style={{ fontSize: 13, color: '#6b7280', margin: '-4px 0 10px' }}>
            รายการที่ {ai.index + 1} จาก {total} (ข้อความเดียวมีหลายรายการ ตรวจทีละรายการ)
          </div>
        )}

        {ai && (
          <div data-ai-badge style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: '#EEEDFE', color: '#3C3489' }}>{isReceipt ? '✨ AI อ่านจากรูปใบเสร็จ' : '✨ AI แยกรายการให้'}</span>
            <span data-ai-confidence style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: tone.bg, color: tone.fg }}>
              {tone.label} {Math.round(ai.confidence * 100)}%
            </span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{isReceipt ? 'ตรวจเทียบกับรูปใบเสร็จก่อนกดยืนยันเสมอ' : 'ตรวจให้ตรงกับที่ต้องการก่อนกดยืนยันเสมอ'}</span>
          </div>
        )}

        {isReceipt && <ReceiptPanel receipt={draft.receipt} image={draft.receipt_image} flags={ai ? ai.flags : {}} clientMs={ai ? ai.client_ms : undefined} engine={ai ? ai.engine : undefined} attempts={ai ? ai.attempts : undefined} />}

        {draft.fallback_reason && (
          <div data-fallback className="alert" style={{ marginBottom: 14 }}>
            ใช้การแยกแบบกฎแทน AI: {draft.fallback_reason} กรุณาตรวจสอบรายการก่อนบันทึก
          </div>
        )}

        {draft.is_simulated ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            โหมดสาธิต: ระบบยังไม่ได้อ่านตัวอักษรในรูปจริง ตัวเลขและร้านค้าเป็นค่าตัวอย่างที่เดาจากชื่อไฟล์
            กรุณาแก้ให้ตรงกับใบเสร็จก่อนบันทึก
          </div>
        ) : (
          !draft.ai && draft.confidence !== 'high' && (
            <div className="alert" style={{ marginBottom: 14 }}>
              ระบบไม่แน่ใจบางส่วน (จำนวนเงินหรือหมวดหมู่) กรุณาตรวจสอบก่อนบันทึก
            </div>
          )
        )}

        {draft.image_url && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <img src={draft.image_url} alt="ตัวอย่างใบเสร็จ" style={{ maxHeight: 160, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          </div>
        )}

        {draft.raw_text && (
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0 }} data-heard>
            {draft.source === 'voice' ? 'ข้อความที่ได้ยิน' : 'ข้อความที่พิมพ์'}: “{draft.raw_text}”
            {draft.source === 'voice' && draft.normalized_text && draft.normalized_text !== draft.raw_text && (
              <>
                <br />
                แปลงเลขเป็น: “{draft.normalized_text}”
              </>
            )}
          </p>
        )}
        {draft.source === 'voice' && (
          <p data-voice-hint style={{ fontSize: 12, color: '#9ca3af', marginTop: -6 }}>
            การถอดเสียงอาจผิดพลาด โปรดตรวจจำนวนเงิน วันที่ และหมวดหมู่ให้ตรงกับที่พูดก่อนบันทึก
          </p>
        )}

        <form onSubmit={submit}>
          <div style={grid}>
            <div>
              <label style={label}>ประเภท</label>
              <select style={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category_id: '' })}>
                <option value="expense">รายจ่าย</option>
                <option value="income">รายรับ</option>
              </select>
            </div>
            <div>
              <label style={label}>หมวดหมู่</label>
              <CategorySelect
                style={flagCategory ? { ...field, ...warnRing } : field}
                categories={categories}
                type={form.type}
                value={form.category_id}
                onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                onCreated={onCategoryCreated}
                required
              />
              {flagCategory && <div data-flag-category style={hint}>AI เดาหมวดนี้ (ไม่พบหมวดที่ตรง) ตรวจสอบอีกครั้ง</div>}
            </div>
          </div>

          <div style={grid}>
            <div>
              <label style={label}>จำนวนเงิน</label>
              <input style={flagAmount ? { ...field, ...warnRing } : field} type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required />
              {flagAmount && <div data-flag-amount style={hint}>{amountFlag === 'mismatch' ? 'ยอดรวมไม่ตรงกับผลรวมรายการสินค้า ตรวจกับรูปใบเสร็จ' : amountFlag === 'items' ? 'อ่านยอดรวมไม่ชัด ใช้ผลรวมรายการแทน ตรวจกับรูปใบเสร็จ' : 'AI ไม่ค่อยมั่นใจ ตรวจจำนวนเงินอีกครั้ง'}</div>}
            </div>
            <div>
              <label style={label}>วันที่</label>
              <input style={flagDate ? { ...field, ...warnRing } : field} type="date" value={form.transaction_date} onChange={set('transaction_date')} required />
              {flagDate && <div data-flag-date style={hint}>{isReceipt ? 'AI ไม่พบวันที่ในใบเสร็จ ใช้วันนี้ให้' : 'AI ไม่พบวันที่ในข้อความ ใช้วันนี้ให้'}</div>}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>บันทึกช่วยจำ</label>
            <input style={field} value={form.note} onChange={set('note')} placeholder="ไม่บังคับ" />
          </div>

          {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-light" data-cancel onClick={onClose} disabled={busy}>{total > 1 ? 'ยกเลิกทั้งหมด' : 'ยกเลิก'}</button>
            {total > 1 && onSkip && <button type="button" className="btn btn-light" data-skip onClick={onSkip} disabled={busy}>ข้ามรายการนี้</button>}
            <button className="btn" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'กำลังบันทึก...' : '✅ ยืนยันบันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
