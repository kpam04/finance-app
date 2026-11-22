import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import useUsernameCheck from '../utils/useUsernameCheck.js';

// ป๊อปอัป "ขอเปลี่ยนชื่อผู้ใช้": ชื่อผู้ใช้ล็อกหลังตั้ง เปลี่ยนได้เมื่อแอดมินอนุมัติเท่านั้น
//  - ไม่มีคำขอค้าง: กรอกชื่อใหม่ + เหตุผล (10-300 ตัวอักษร) แล้วส่ง
//  - มีคำขอรอพิจารณา: แสดงรายละเอียด + ยกเลิกคำขอได้
//  - คำขอล่าสุดถูกปฏิเสธ (ไม่เกิน 7 วัน): แสดงเหตุผลที่ปฏิเสธ และวันที่ยื่นใหม่ได้
const REASON_MIN = 10;
const REASON_MAX = 300;

const css = `
.ur-overlay { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.ur-box { width: 460px; max-width: 100%; max-height: 92vh; overflow-y: auto; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.ur-box h3 { margin: 0 0 6px; }
.ur-sub { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #6b6358; }
.ur-label { display: block; margin: 0 0 4px; font-size: 13px; color: #4b5563; }
.ur-field { margin-bottom: 14px; }
.ur-field input, .ur-field textarea { width: 100%; box-sizing: border-box; }
.ur-field textarea { min-height: 92px; resize: vertical; font: inherit; }
.ur-msg { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; font-size: 12px; color: #9a9184; }
.ur-msg .bad { color: #B8304F; }
.ur-msg .ok { color: #4F7A4A; }
.ur-card { padding: 12px 14px; border-radius: 12px; background: #FAF8F4; border: 1px solid #EFE9DF; font-size: 13.5px; line-height: 1.7; color: #4B4740; }
.ur-card dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; margin: 0; }
.ur-card dt { color: #8A8177; }
.ur-card dd { margin: 0; word-break: break-word; }
.ur-chip { display: inline-block; margin-bottom: 8px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.ur-chip.pending { background: #F9EFCB; color: #8F6F00; }
.ur-chip.rejected { background: #F8DDE4; color: #B8304F; }
.ur-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
`;

const thDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

export default function UsernameRequestModal({ currentUsername, onClose, onDone }) {
  const [state, setState] = useState(null); // { request, can_request, can_request_at }
  const [loadErr, setLoadErr] = useState('');
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const uCheck = useUsernameCheck(username, currentUsername);
  const sameAsNow = username.trim().toLowerCase() === (currentUsername || '');

  useEffect(() => {
    let live = true;
    api.getUsernameRequest()
      .then((r) => { if (live) setState(r.data); })
      .catch((e) => { if (live) setLoadErr(e.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const reasonLen = Array.from(reason.trim()).length;
  const nameOk = uCheck.state === 'ok' && !sameAsNow;
  const canSend = nameOk && reasonLen >= REASON_MIN && reasonLen <= REASON_MAX && !busy;

  const send = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setErr('');
    setBusy(true);
    try {
      const r = await api.createUsernameRequest({ username: username.trim(), reason: reason.trim() });
      setState(r.data);
      onDone && onDone('ส่งคำขอแล้ว รอแอดมินพิจารณา');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await api.cancelUsernameRequest();
      setState(r.data);
      onDone && onDone('ยกเลิกคำขอแล้ว');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const req = state && state.request;
  const pending = req && req.status === 'pending';
  const waitUntil = state && state.can_request_at;

  let body;
  if (!state && !loadErr) body = <p className="ur-sub">กำลังโหลด...</p>;
  else if (loadErr) body = <div className="alert">{loadErr}</div>;
  else if (pending) {
    body = (
      <div className="ur-card" data-ur-pending>
        <span className="ur-chip pending">รอแอดมินพิจารณา</span>
        <dl>
          <dt>จาก</dt><dd>@{req.from_username}</dd>
          <dt>เป็น</dt><dd><b>@{req.to_username}</b></dd>
          <dt>เหตุผล</dt><dd>{req.reason}</dd>
          <dt>ยื่นเมื่อ</dt><dd>{thDate(req.created_at)}</dd>
        </dl>
      </div>
    );
  } else if (waitUntil) {
    body = (
      <div className="ur-card" data-ur-rejected>
        <span className="ur-chip rejected">ไม่ได้รับอนุมัติ</span>
        <dl>
          <dt>ชื่อที่ขอ</dt><dd>@{req.to_username}</dd>
          {req.decision_note && (<><dt>เหตุผล</dt><dd>{req.decision_note}</dd></>)}
          <dt>ยื่นใหม่ได้</dt><dd>ตั้งแต่ {thDate(waitUntil)}</dd>
        </dl>
      </div>
    );
  } else {
    body = (
      <>
        <div className="ur-field">
          <label className="ur-label" htmlFor="ur-name">ชื่อผู้ใช้ใหม่</label>
          <input id="ur-name" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoCapitalize="none" spellCheck={false} data-ur-name />
          <div className="ur-msg">
            {sameAsNow && username
              ? <span className="bad">ชื่อใหม่ต้องไม่ซ้ำกับชื่อผู้ใช้ปัจจุบัน</span>
              : uCheck.message && uCheck.state !== 'checking'
                ? <span className={uCheck.state === 'ok' ? 'ok' : 'bad'}>{uCheck.message}</span>
                : <span>a-z, 0-9, จุด และขีดล่าง ยาว 3-20 ตัว ขึ้นต้นด้วยตัวอักษร</span>}
          </div>
        </div>
        <div className="ur-field">
          <label className="ur-label" htmlFor="ur-reason">เหตุผลที่ขอเปลี่ยน</label>
          <textarea id="ur-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX + 20} placeholder="เช่น พิมพ์ชื่อผิดตอนสมัคร" data-ur-reason />
          <div className="ur-msg">
            <span className={reasonLen > 0 && reasonLen < REASON_MIN ? 'bad' : ''}>{reasonLen > 0 && reasonLen < REASON_MIN ? `อย่างน้อย ${REASON_MIN} ตัวอักษร` : 'แอดมินจะอนุมัติเฉพาะกรณีจำเป็น'}</span>
            <span className={reasonLen > REASON_MAX ? 'bad' : ''}>{reasonLen}/{REASON_MAX}</span>
          </div>
        </div>
      </>
    );
  }

  return createPortal(
    <div className="ur-overlay" data-ur-modal>
      <style>{css}</style>
      <form className="ur-box" role="dialog" aria-modal="true" aria-labelledby="ur-title" onSubmit={send} onClick={(e) => e.stopPropagation()}>
        <h3 id="ur-title">ขอเปลี่ยนชื่อผู้ใช้</h3>
        <p className="ur-sub">ชื่อผู้ใช้ปัจจุบัน <b>@{currentUsername}</b> · เปลี่ยนได้เมื่อแอดมินอนุมัติ อนุมัติแล้วชื่อจะเปลี่ยนให้ทันที</p>
        {err && <div className="alert" style={{ marginBottom: 12 }} data-ur-error>{err}</div>}
        {body}
        <div className="ur-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ปิด</button>
          {pending && <button type="button" className="btn btn-light" data-ur-cancel onClick={cancel} disabled={busy}>ยกเลิกคำขอ</button>}
          {state && !pending && !waitUntil && (
            <button className="btn" data-ur-send disabled={!canSend}>{busy ? 'กำลังส่ง...' : 'ส่งคำขอ'}</button>
          )}
        </div>
      </form>
    </div>,
    document.body
  );
}
