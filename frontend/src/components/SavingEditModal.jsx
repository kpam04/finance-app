import { useEffect, useState } from 'react';
import { api } from '../api.js';

// แก้รายการออม/ถอน (จากหน้ารายการ): แก้ได้แค่จำนวนเงินกับวันที่
// หมวด "การออม" เป้าหมาย และเหตุผลที่ถอน แสดงอย่างเดียว ยอดในเป้าปรับตามให้อัตโนมัติ
const css = `
.se-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.se-box { width: 100%; max-width: 400px; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.se-box h3 { margin: 0 0 14px; }
.se-info { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; margin: 0 0 14px; padding: 10px 12px; border-radius: 10px; background: #F7F5F0; font-size: 13.5px; }
.se-info dt { color: #8A8177; }
.se-info dd { margin: 0; color: #3F3A34; word-break: break-word; }
.se-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.se-field > span { font-size: 13px; color: #4b5563; }
.se-field input { width: 100%; box-sizing: border-box; }
.se-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.se-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
`;

const todayIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function SavingEditModal({ tx, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [date, setDate] = useState(tx.transaction_date);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isWithdraw = tx.type === 'withdraw';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const body = {};
    if (Number(amount) !== Number(tx.amount)) body.amount = amount;
    if (date !== tx.transaction_date) body.transaction_date = date;
    if (!Object.keys(body).length) return onClose();
    setError('');
    setBusy(true);
    try {
      const res = await api.updateTransaction(tx.transaction_id, body);
      onSaved(res);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div className="se-overlay" data-saving-edit onClick={() => !busy && onClose()}>
      <style>{css}</style>
      <form className="se-box" role="dialog" aria-modal="true" aria-labelledby="se-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="se-title">{isWithdraw ? 'แก้ไขรายการถอน' : 'แก้ไขรายการออม'}</h3>
        {error && <p className="se-error" role="alert" data-se-error>{error}</p>}
        <dl className="se-info">
          <dt>หมวดหมู่</dt><dd>การออม</dd>
          <dt>เป้าหมาย</dt><dd>{tx.goal_name}</dd>
          {isWithdraw && tx.reason && (<><dt>เหตุผล</dt><dd>{tx.reason}</dd></>)}
        </dl>
        <label className="se-field">
          <span>{isWithdraw ? 'จำนวนเงินที่ถอน (บาท)' : 'จำนวนเงินที่ออม (บาท)'}</span>
          <input type="number" inputMode="decimal" min="0.01" step="any" value={amount} required autoFocus onChange={(e) => setAmount(e.target.value)} data-se-amount />
        </label>
        <label className="se-field">
          <span>{isWithdraw ? 'วันที่ถอน' : 'วันที่ออม'}</span>
          <input type="date" value={date} max={todayIso()} required onChange={(e) => setDate(e.target.value)} data-se-date />
        </label>
        <div className="se-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy} data-se-save>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  );
}
