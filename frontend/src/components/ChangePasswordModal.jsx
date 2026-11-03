import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, setToken } from '../api.js';
import { checkPassword } from '../utils/validators.js';

// ป๊อปอัป "เปลี่ยนรหัสผ่าน" (เปิดจากปุ่มข้างปุ่มดินสอบนการ์ดโปรไฟล์) แยกจากป๊อปอัปแก้ไขโปรไฟล์เพราะผลต่างกัน
// (เปลี่ยนรหัสผ่านแล้วอุปกรณ์อื่นที่ล็อกอินอยู่ถูกออกจากระบบ เครื่องนี้ได้บัตรผ่านใหม่ใช้ต่อ)
const css = `
.pw-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.pw-box { width: 440px; max-width: 100%; max-height: 92vh; overflow-y: auto; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.pw-box h3 { margin: 0 0 4px; }
.pw-note { margin: 0 0 14px; font-size: 13px; color: #6b7280; line-height: 1.6; }
.pw-label { display: block; margin: 0 0 4px; font-size: 13px; color: #4b5563; }
.pw-box input[type='password'], .pw-box input[type='text'] { width: 100%; box-sizing: border-box; margin-bottom: 12px; }
.pw-show { display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 13px; color: #4b5563; cursor: pointer; }
.pw-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
`;

export default function ChangePasswordModal({ onClose, onChanged }) {
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm_new_password: '' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const type = show ? 'text' : 'password';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const check = checkPassword(pw.new_password, 'รหัสผ่านใหม่');
    if (check.error) return setErr(check.error);
    if (pw.new_password !== pw.confirm_new_password) return setErr('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');

    setBusy(true);
    try {
      const res = await api.updateProfile({ ...pw });
      // เปลี่ยนรหัสผ่านแล้ว token เดิมใช้ไม่ได้ทุกเครื่อง backend ส่ง token ใหม่มาให้เครื่องนี้ใช้ต่อ
      if (res && res.token) setToken(res.token);
      onChanged('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว (อุปกรณ์อื่นที่ล็อกอินอยู่ถูกออกจากระบบ)');
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="pw-overlay" data-password-modal>
      <style>{css}</style>
      <form className="pw-box" role="dialog" aria-modal="true" aria-labelledby="pw-title" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h3 id="pw-title">เปลี่ยนรหัสผ่าน</h3>
        <p className="pw-note">หลังเปลี่ยนรหัสผ่าน อุปกรณ์อื่นที่ล็อกอินอยู่จะถูกออกจากระบบ เครื่องนี้ใช้งานต่อได้ตามปกติ</p>
        {err && <div className="alert" data-pw-error style={{ marginBottom: 12 }}>{err}</div>}

        <label className="pw-label" htmlFor="pw-current">รหัสผ่านปัจจุบัน</label>
        <input id="pw-current" autoFocus type={type} value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" required />

        <label className="pw-label" htmlFor="pw-new">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
        <input id="pw-new" type={type} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" required />

        <label className="pw-label" htmlFor="pw-confirm">ยืนยันรหัสผ่านใหม่</label>
        <input id="pw-confirm" type={type} value={pw.confirm_new_password} onChange={(e) => setPw({ ...pw, confirm_new_password: e.target.value })} autoComplete="new-password" required />

        <label className="pw-show"><input type="checkbox" data-pw-show checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 16, height: 16, minHeight: 0, padding: 0, margin: 0, flex: '0 0 16px' }} /> แสดงรหัสผ่าน</label>

        <div className="pw-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn" data-pw-save disabled={busy}>{busy ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
