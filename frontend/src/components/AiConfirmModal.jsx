import { useState } from 'react';

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

export default function AiConfirmModal({ draft, categories, onConfirm, onClose }) {
  const [form, setForm] = useState({
    type: draft.type || 'expense',
    category_id: draft.category_id || '',
    amount: draft.amount === '' || draft.amount == null ? '' : String(draft.amount),
    transaction_date: draft.transaction_date,
    note: draft.note || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const catOptions = categories.filter((c) => c.type === form.type);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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

        {draft.is_simulated ? (
          <div className="alert" style={{ marginBottom: 14 }}>
            โหมดสาธิต: ระบบยังไม่ได้อ่านตัวอักษรในรูปจริง ตัวเลขและร้านค้าเป็นค่าตัวอย่างที่เดาจากชื่อไฟล์
            กรุณาแก้ให้ตรงกับใบเสร็จก่อนบันทึก
          </div>
        ) : (
          draft.confidence !== 'high' && (
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
              <select style={field} value={form.category_id} onChange={set('category_id')} required>
                <option value="">-- เลือกหมวดหมู่ --</option>
                {catOptions.map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={grid}>
            <div>
              <label style={label}>จำนวนเงิน</label>
              <input style={field} type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required />
            </div>
            <div>
              <label style={label}>วันที่</label>
              <input style={field} type="date" value={form.transaction_date} onChange={set('transaction_date')} required />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={label}>บันทึกช่วยจำ</label>
            <input style={field} value={form.note} onChange={set('note')} placeholder="ไม่บังคับ" />
          </div>

          {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button className="btn" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'กำลังบันทึก...' : '✅ ยืนยันบันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
