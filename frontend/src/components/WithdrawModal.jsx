import { useEffect, useState } from 'react';
import { api } from '../api.js';

// ป๊อปอัปถอนออกจากเป้าหมาย (เปิดจากไอคอนกระเป๋าเงินบนการ์ดเป้าที่กำลังออม)
//  - ถอนได้ไม่เกินยอดที่ออมไว้ วันที่ = วันนี้ (ระบบใส่ให้)
//  - เหตุผลไม่บังคับ บันทึกแล้วแก้ไม่ได้ (แสดงในหน้ารายการ)
//  - เงินที่ถอนกลับไปรวมในเงินคงเหลือ ไม่นับเป็นรายรับ
const REASON_MAX = 100;
const PRESETS = ['เหตุฉุกเฉิน', 'ค่าใช้จ่ายจำเป็น', 'เปลี่ยนแผน'];

const css = `
.wd-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.wd-box { width: 100%; max-width: 420px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.wd-box h3 { margin: 0 0 4px; }
.wd-sub { margin: 0 0 14px; font-size: 13px; color: #8A8177; }
.wd-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.wd-field > span { font-size: 13px; color: #4b5563; }
.wd-field input, .wd-field textarea { width: 100%; box-sizing: border-box; min-width: 0; }
.wd-amt { font-size: 20px !important; font-weight: 700; }
.wd-field textarea { min-height: 64px; resize: vertical; font: inherit; }
.wd-pv { margin: -4px 0 12px; font-size: 13px; color: #8A8177; }
.wd-pv b { color: #4F6E80; }
.wd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.wd-chips button { padding: 3px 11px; border-radius: 999px; border: 1px solid #E9E1D6; background: #fff; font: inherit; font-size: 12.5px; color: #6b6358; cursor: pointer; }
.wd-chips button.on { border-color: #9DB4C2; background: #EEF3F6; color: #3F5E6E; font-weight: 600; }
.wd-cnt { display: flex; justify-content: space-between; font-size: 12px; color: #9a9184; }
.wd-cnt .bad { color: #B8304F; }
.wd-note { margin: 0 0 14px; padding: 8px 11px; border-radius: 8px; background: #F6F1E3; color: #6E5520; font-size: 12.5px; line-height: 1.6; }
.wd-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.wd-actions { display: flex; justify-content: flex-end; gap: 8px; }
.wd-go { background: #6F8FA0 !important; border-color: #6F8FA0 !important; }
.wd-go:hover:not(:disabled) { background: #5E7D8E !important; }
`;

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export default function WithdrawModal({ goal, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = Number(goal.saved_amount) || 0;
  const target = Number(goal.target_amount) || 0;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const n = Number(amount);
  const amtOk = amount !== '' && Number.isFinite(n) && n > 0;
  const over = amtOk && n > saved;
  const left = Math.max(0, Math.round((saved - (amtOk ? n : 0)) * 100) / 100);
  const reasonLen = Array.from(reason.trim()).length;
  const canSend = amtOk && !over && reasonLen <= REASON_MAX && !busy;

  // ปุ่มลัด: ใส่คำนำหน้าเหตุผล (พิมพ์ต่อได้) กดซ้ำ = เอาออก
  const preset = (p) => {
    setReason((r) => {
      const cur = r.trim();
      if (cur === p || cur.startsWith(`${p}: `)) return cur.slice(p.length).replace(/^:\s*/, '');
      const rest = PRESETS.reduce((s, x) => (s === x ? '' : s.startsWith(`${x}: `) ? s.slice(x.length + 2) : s), cur);
      return rest ? `${p}: ${rest}` : p;
    });
  };
  const activePreset = PRESETS.find((p) => reason.trim() === p || reason.trim().startsWith(`${p}: `));

  const submit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setError('');
    setBusy(true);
    try {
      const res = await api.withdrawGoal(goal.goal_id, amount, reason.trim());
      onSaved(res.data.goal, res.data);
    } catch (err) {
      setError(err.message || 'ถอนไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div className="wd-overlay" data-withdraw-modal onClick={() => !busy && onClose()}>
      <style>{css}</style>
      <form className="wd-box" role="dialog" aria-modal="true" aria-labelledby="wd-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="wd-title">ถอนออกจากเป้า</h3>
        <p className="wd-sub">{goal.name} · ถอนได้สูงสุด {baht(saved)}</p>
        {error && <p className="wd-error" role="alert" data-wd-error>{error}</p>}
        <label className="wd-field">
          <span>จำนวนเงิน (บาท)</span>
          <input className="wd-amt" type="number" inputMode="decimal" min="0.01" max={saved} step="any" value={amount} required autoFocus onChange={(e) => setAmount(e.target.value)} data-wd-amount />
        </label>
        <p className="wd-pv" data-wd-preview>
          {over
            ? <span style={{ color: '#B8304F' }}>เกินยอดที่ออมไว้ {baht(saved)}</span>
            : <>เหลือในเป้า <b>{baht(left)}</b>{target > 0 && ` · ${Math.round((left / target) * 100)}% ของเป้า`}</>}
        </p>
        <div className="wd-field">
          <span>เหตุผลที่ถอน (ไม่บังคับ)</span>
          <div className="wd-chips">
            {PRESETS.map((p) => (
              <button type="button" key={p} className={activePreset === p ? 'on' : ''} onClick={() => preset(p)} data-wd-preset>{p}</button>
            ))}
          </div>
          <textarea value={reason} maxLength={REASON_MAX + 20} placeholder="เช่น ค่ารักษาพยาบาล" onChange={(e) => setReason(e.target.value)} aria-label="เหตุผลที่ถอน" data-wd-reason />
          <div className="wd-cnt"><span>บันทึกแล้วแก้ไขไม่ได้</span><span className={reasonLen > REASON_MAX ? 'bad' : ''}>{reasonLen}/{REASON_MAX}</span></div>
        </div>
        <p className="wd-note">เงินที่ถอนจะกลับไปรวมในเงินคงเหลือ ไม่นับเป็นรายรับ</p>
        <div className="wd-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn wd-go" disabled={!canSend} data-wd-save>{busy ? 'กำลังบันทึก...' : 'ถอนออก'}</button>
        </div>
      </form>
    </div>
  );
}
