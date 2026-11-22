import { useEffect, useState } from 'react';
import { api } from '../api.js';

// ป๊อปอัปเพิ่ม/แก้ไขเป้าหมายการออม ข้อความผิดพลาดจากหลังบ้านแสดงในป๊อปอัป
//  - เพิ่มใหม่: ชื่อ ยอดเป้าหมาย ยอดที่ออมไว้แล้ว (ยอดตั้งต้น) วันที่อยากถึง
//  - แก้ไข: "ออมไว้แล้ว" ล็อกเป็นยอดปัจจุบัน กรอก "ออมเพิ่ม" แล้วบันทึก ยอดปัจจุบันบวกให้ + เก็บเป็นประวัติการออม
//           กรอกผิด: ลบรายการในประวัติ ยอดปัจจุบันลดลงตาม
//  - reopen: ย้ายเป้าที่สำเร็จแล้วกลับไปกำลังออม (กรณีกรอกยอดผิด) แก้ยอดที่ออมแล้วตรงๆ ให้น้อยกว่ายอดเป้าหมาย
// onSaved(goal, data): data.just_completed = ยอดออมถึงเป้า ระบบย้ายไป "สำเร็จแล้ว" ให้ (data.achievement)
const css = `
.gm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.gm-box { width: 100%; max-width: 440px; max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.gm-box h3 { margin: 0 0 14px; }
.gm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.gm-field > span { font-size: 13px; color: #4b5563; }
.gm-field > small { font-size: 12px; color: #8A8177; }
.gm-field input { width: 100%; box-sizing: border-box; min-width: 0; }
.gm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gm-locked { flex: 1 1 auto; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; box-sizing: border-box; border: 1px solid #EBE5DB; border-radius: 8px; background: #F5F2EC; color: #6b6358; font-weight: 600; }
.gm-locked svg { flex: 0 0 auto; color: #A39A8E; }
.gm-preview { font-size: 12.5px; color: #8A8177; }
.gm-preview b { color: #4F7A4A; }
.gm-preview.done b { color: #4F7A4A; }
.gm-hist { margin: 4px 0 6px; }
.gm-hist-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; font-size: 13px; color: #4b5563; }
.gm-hist-h small { font-size: 12px; color: #8A8177; }
.gm-hist-list { max-height: 196px; overflow-y: auto; border: 1px solid #EFE9DF; border-radius: 10px; }
.gm-hist-row { display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 4px 6px 4px 12px; font-size: 13.5px; }
.gm-hist-row + .gm-hist-row { border-top: 1px solid #F1ECE3; }
.gm-hist-date { flex: 1 1 auto; color: #6b6358; }
.gm-hist-amt { font-weight: 600; color: #4F7A4A; }
.gm-hist-del { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: none; border-radius: 8px; background: transparent; color: #A39A8E; cursor: pointer; }
.gm-hist-del:hover { background: #FBEAEE; color: #B8304F; }
.gm-hist-ask { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #B8304F; }
.gm-hist-ask button { padding: 3px 10px; border-radius: 7px; border: 1px solid #E9E1D6; background: #fff; font: inherit; font-size: 12.5px; cursor: pointer; color: #4b5563; }
.gm-hist-ask button.yes { border-color: #D45C78; background: #D45C78; color: #fff; }
.gm-hist-empty { padding: 12px; font-size: 13px; color: #9a9184; text-align: center; }
.gm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.gm-note { margin: -6px 0 12px; padding: 8px 12px; border-radius: 8px; background: #F6F1E3; color: #6E5520; font-size: 13px; line-height: 1.6; }
.gm-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
`;

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const thDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const tomorrow = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + 86400000);
  return d.toISOString().slice(0, 10);
};

const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>
);

export default function GoalModal({ goal, reopen = false, onClose, onSaved }) {
  const editing = !!goal;
  const depositMode = editing && !reopen; // แก้ไขเป้าที่กำลังออม: ล็อกยอดที่ออมแล้ว + ออมเพิ่ม
  const [name, setName] = useState(editing ? goal.name : '');
  const [target, setTarget] = useState(editing ? String(goal.target_amount) : '');
  const [saved, setSaved] = useState(editing ? String(goal.saved_amount) : '');
  const [current, setCurrent] = useState(editing ? Number(goal.saved_amount) || 0 : 0); // ยอดปัจจุบัน (ล็อก)
  const [add, setAdd] = useState('');
  const [date, setDate] = useState(editing ? goal.target_date : '');
  const [hist, setHist] = useState(null); // { deposits, count }
  const [askDel, setAskDel] = useState(null); // deposit_id ที่กำลังถามยืนยันลบ
  const [changed, setChanged] = useState(false); // ลบรายการในประวัติแล้ว (ต้องโหลดหน้าใหม่ตอนปิด)
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    if (changed) onSaved(null, {});
    else onClose();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!depositMode) return undefined;
    let live = true;
    api.getGoalDeposits(goal.goal_id)
      .then((r) => { if (live) { setHist(r.data); setCurrent(Number(r.data.saved_amount) || 0); } })
      .catch(() => { if (live) setHist({ deposits: [], count: 0, failed: true }); });
    return () => { live = false; };
  }, [depositMode, goal]);

  const addNum = Number(add);
  const addOk = add !== '' && Number.isFinite(addNum) && addNum > 0;
  const targetNum = Number(target) || 0;
  const nextSaved = Math.round((current + (addOk ? addNum : 0)) * 100) / 100;

  const removeDeposit = async (d) => {
    setError('');
    setBusy(true);
    try {
      await api.deleteGoalDeposit(goal.goal_id, d.deposit_id);
      setHist((h) => ({ ...h, deposits: h.deposits.filter((x) => x.deposit_id !== d.deposit_id), count: Math.max(0, h.count - 1) }));
      setCurrent((c) => Math.max(0, Math.round((c - d.amount) * 100) / 100));
      setChanged(true);
      setAskDel(null);
    } catch (err) {
      setError(err.message || 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (depositMode && add !== '' && !addOk) return setError('ยอดออมเพิ่มไม่ถูกต้อง');
    setBusy(true);
    try {
      if (!editing) {
        const res = await api.createGoal({ name, target_amount: target, saved_amount: saved === '' ? 0 : saved, target_date: date });
        return onSaved(res.data.goal, res.data);
      }
      if (reopen) {
        const body = { name, target_amount: target, saved_amount: saved === '' ? 0 : saved, reopen: true };
        if (date !== goal.target_date) body.target_date = date;
        const res = await api.updateGoal(goal.goal_id, body);
        return onSaved(res.data.goal, res.data);
      }
      // แก้ไข: ส่งเฉพาะช่องที่เปลี่ยน (เป้าที่เลยกำหนดแล้วแก้ช่องอื่นได้โดยไม่ต้องเลื่อนวันที่) แล้วค่อยบันทึกยอดออมเพิ่ม
      const body = {};
      if (name !== goal.name) body.name = name;
      if (Number(target) !== Number(goal.target_amount)) body.target_amount = target;
      if (date !== goal.target_date) body.target_date = date;
      let res = null;
      if (Object.keys(body).length) {
        res = await api.updateGoal(goal.goal_id, body);
        if (res.data.just_completed) return onSaved(null, res.data); // ลดยอดเป้าจนถึงแล้ว: ไม่ต้องออมเพิ่ม
      }
      if (addOk) res = await api.addGoalDeposit(goal.goal_id, add);
      if (res) return onSaved(res.data.goal, res.data);
      close();
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-overlay" data-goal-modal onClick={close}>
      <style>{css}</style>
      <form className="gm-box" role="dialog" aria-modal="true" aria-labelledby="gm-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 id="gm-title">{reopen ? 'ย้ายกลับไปกำลังออม' : editing ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมายการออม'}</h3>
        {reopen && <p className="gm-note" data-gm-reopen-note>แก้ “ออมไว้แล้ว” ให้เป็นยอดที่ถูกต้อง (ต้องน้อยกว่ายอดเป้าหมาย) แล้วกดบันทึก เป้าหมายจะกลับไปอยู่ใน “กำลังออม”</p>}
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
          <span>อยากถึงเป้าหมายภายในวันที่</span>
          <input type="date" value={date} min={editing && date === goal.target_date ? undefined : tomorrow()} required onChange={(e) => setDate(e.target.value)} data-gm-date />
        </label>

        {depositMode ? (
          <>
            <div className="gm-row2">
              <div className="gm-field">
                <span>ออมไว้แล้ว</span>
                <div className="gm-locked" data-gm-current title="ยอดปัจจุบัน เปลี่ยนได้ด้วยการออมเพิ่ม หรือลบรายการในประวัติ"><IconLock />{baht(current)}</div>
              </div>
              <label className="gm-field">
                <span>ออมเพิ่ม (บาท)</span>
                <input type="number" inputMode="decimal" min="0.01" step="any" value={add} placeholder="เช่น 1000" onChange={(e) => setAdd(e.target.value)} data-gm-add autoFocus />
              </label>
            </div>
            <p className="gm-preview" data-gm-preview style={{ margin: '-4px 0 12px' }}>
              {addOk
                ? <>ยอดใหม่ <b>{baht(nextSaved)}</b>{targetNum > 0 && <> จากเป้า {baht(targetNum)}{nextSaved >= targetNum && ' · ถึงเป้าแล้ว'}</>}</>
                : <>กรอกยอดที่ออมเพิ่ม แล้วกดบันทึก ระบบจะบวกเข้ายอดปัจจุบันให้</>}
            </p>
            <div className="gm-hist" data-gm-history>
              <div className="gm-hist-h">ประวัติการออม{hist && hist.count > 0 && <small>{hist.count} รายการ</small>}</div>
              <div className="gm-hist-list">
                {!hist && <div className="gm-hist-empty">กำลังโหลด...</div>}
                {hist && hist.failed && <div className="gm-hist-empty">โหลดประวัติไม่สำเร็จ</div>}
                {hist && !hist.failed && hist.deposits.length === 0 && <div className="gm-hist-empty">ยังไม่มีการออมเพิ่ม</div>}
                {hist && hist.deposits.map((d) => (
                  <div className="gm-hist-row" key={d.deposit_id} data-gm-dep>
                    <span className="gm-hist-date">{thDate(d.created_at)}</span>
                    {askDel === d.deposit_id ? (
                      <span className="gm-hist-ask">
                        ลบ +{baht(d.amount)}?
                        <button type="button" className="yes" onClick={() => removeDeposit(d)} disabled={busy} data-gm-dep-yes>ลบ</button>
                        <button type="button" onClick={() => setAskDel(null)} disabled={busy}>ไม่</button>
                      </span>
                    ) : (
                      <>
                        <span className="gm-hist-amt">+{baht(d.amount)}</span>
                        <button type="button" className="gm-hist-del" aria-label={`ลบรายการออม ${baht(d.amount)}`} title="ลบ (กรอกผิด)" onClick={() => setAskDel(d.deposit_id)} data-gm-dep-del><IconTrash /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <label className="gm-field">
            <span>ออมไว้แล้ว (บาท)</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={saved} placeholder="ไม่บังคับ" onChange={(e) => setSaved(e.target.value)} data-gm-saved />
            {!editing && <small>ยอดตั้งต้น หลังจากนี้กด “แก้ไข” แล้วกรอกยอดออมเพิ่มได้ ถ้าถึงยอดเป้าหมาย ระบบจะย้ายไป “สำเร็จแล้ว” ให้</small>}
          </label>
        )}

        <div className="gm-actions">
          <button type="button" className="btn btn-light" onClick={close} disabled={busy} data-gm-cancel>{changed ? 'ปิด' : 'ยกเลิก'}</button>
          <button type="submit" className="btn" disabled={busy} data-gm-save>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
        </div>
      </form>
    </div>
  );
}
