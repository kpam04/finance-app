import { useEffect, useState } from 'react';
import { api } from '../api.js';

// ป๊อปอัปเพิ่ม/แก้ไขเป้าหมายการออม (ชื่อ ยอดเป้าหมาย ยอดที่ออมแล้ว วันที่อยากถึง) ข้อความผิดพลาดจากหลังบ้านแสดงในป๊อปอัป
const css = `
.gm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.gm-box { width: 100%; max-width: 440px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.gm-box h3 { margin: 0 0 14px; }
.gm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.gm-field > span { font-size: 13px; color: #4b5563; }
.gm-field > small { font-size: 12px; color: #8A8177; }
.gm-field input { width: 100%; box-sizing: border-box; min-width: 0; }
.gm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.gm-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
`;

const tomorrow = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + 86400000);
  return d.toISOString().slice(0, 10);
};

export default function GoalModal({ goal, onClose, onSaved }) {
  const editing = !!goal;
  const [name, setName] = useState(editing ? goal.name : '');
  const [target, setTarget] = useState(editing ? String(goal.target_amount) : '');
  const [saved, setSaved] = useState(editing ? String(goal.saved_amount) : '');
  const [date, setDate] = useState(editing ? goal.target_date : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const body = { name, target_amount: target, saved_amount: saved === '' ? 0 : saved, target_date: date };
      const res = editing ? await api.updateGoal(goal.goal_id, body) : await api.createGoal(body);
      onSaved(res.data.goal);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-overlay" data-goal-modal onClick={onClose}>
      <style>{css}</style>
      <form className="gm-box" role="dialog" aria-modal="true" aria-labelledby="gm-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="gm-title">{editing ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมายการออม'}</h3>
        {error && <p className="gm-error" data-form-error role="alert">{error}</p>}
        <label className="gm-field">
          <span>ชื่อเป้าหมาย</span>
          <input type="text" value={name} maxLength={60} required placeholder="เช่น ทริปญี่ปุ่น" onChange={(e) => setName(e.target.value)} data-gm-name />
        </label>
        <label className="gm-field">
          <span>ยอดเป้าหมาย (บาท)</span>
          <input type="number" inputMode="decimal" min="1" step="any" value={target} required placeholder="เช่น 60000" onChange={(e) => setTarget(e.target.value)} data-gm-target />
        </label>
        <label className="gm-field">
          <span>ออมไว้แล้ว (บาท)</span>
          <input type="number" inputMode="decimal" min="0" step="any" value={saved} placeholder="ไม่บังคับ" onChange={(e) => setSaved(e.target.value)} data-gm-saved />
          <small>ตอนนี้ระบบยังไม่ติดตามการออมให้อัตโนมัติ ถ้าออมไปเพิ่ม มาแก้ตัวเลขนี้เอง ระบบจะคำนวณใหม่</small>
        </label>
        <label className="gm-field">
          <span>อยากถึงเป้าหมายภายในวันที่</span>
          <input type="date" value={date} min={tomorrow()} required onChange={(e) => setDate(e.target.value)} data-gm-date />
        </label>
        <div className="gm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy} data-gm-cancel>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy} data-gm-save>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  );
}
