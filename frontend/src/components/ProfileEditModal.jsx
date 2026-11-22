import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import { resizeImageToSquare } from '../utils/imageResize.js';
import useUsernameCheck from '../utils/useUsernameCheck.js';
import UsernameRequestModal from './UsernameRequestModal.jsx';

// ป๊อปอัป "แก้ไขโปรไฟล์" (เปิดจากปุ่มดินสอบนการ์ดโปรไฟล์): รูปโปรไฟล์ + ข้อมูลส่วนตัว
//  รูปที่เลือกยังไม่บันทึกทันที ต้องกด "บันทึกข้อมูล" (กด "ยกเลิก" รูปไม่เปลี่ยน)
const toForm = (u) => ({
  first_name: u.first_name || '',
  last_name: u.last_name || '',
  nickname: u.nickname || '',
  username: u.username || '',
  phone: u.phone || '',
  birth_date: u.birth_date || '',
  occupation: u.occupation || '',
});

const css = `
.pm-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.pm-box { width: 560px; max-width: 100%; max-height: 92vh; overflow-y: auto; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.pm-box h3 { margin: 0 0 14px; }
.pm-photo { display: flex; align-items: center; gap: 16px; margin: 0 0 18px; padding-bottom: 16px; border-bottom: 1px solid #E9E1D6; }
.pm-photo-side { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.pm-photo-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.pm-hint { font-size: 12px; color: #9ca3af; }
.pm-link { padding: 0; border: none; background: none; font: inherit; font-size: 13px; color: #b91c1c; text-decoration: underline; cursor: pointer; }
.pm-photo-err { font-size: 13px; color: #b91c1c; }
.pm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.pm-grid .pm-wide { grid-column: 1 / -1; }
.pm-label { display: block; margin: 0 0 4px; font-size: 13px; color: #4b5563; }
.pm-box input[type='text'], .pm-box input[type='date'], .pm-box input:not([type]) { width: 100%; box-sizing: border-box; }
.pm-locked { position: relative; }
.pm-locked input { padding-right: 34px !important; background: #F4F1EA !important; color: #6b6358 !important; border-color: #E6DFD3 !important; cursor: not-allowed; -webkit-text-fill-color: #6b6358; opacity: 1; }
.pm-locked .pm-lock { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: #A39A8C; pointer-events: none; }
.pm-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.pm-req { display: inline-flex; align-items: center; gap: 4px; margin: 0 0 4px; padding: 0; border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: #4F6B47; cursor: pointer; }
.pm-req:hover { color: #2F4A2B; text-decoration: underline; }
.pm-req:focus-visible { outline: 2px solid #9AAB91; outline-offset: 2px; border-radius: 4px; }
.pm-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 520px) { .pm-grid { grid-template-columns: 1fr; } .pm-photo { align-items: flex-start; } }
`;

// ไอคอนแม่กุญแจท้ายช่องที่แก้ไขเองไม่ได้
const LockIcon = () => (
  <svg className="pm-lock" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
);

export default function ProfileEditModal({ user, onClose, onSaved, resizeImage = resizeImageToSquare }) {
  const { refreshProfile } = useAuth();
  const [form, setForm] = useState(() => toForm(user));
  const [avatarDraft, setAvatarDraft] = useState(undefined); // undefined = ไม่เปลี่ยน / null = ลบรูป / ข้อความ = รูปใหม่ (data URL)
  const [photoErr, setPhotoErr] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const shown = avatarDraft === undefined ? user.avatar : avatarDraft;
  // ตั้งชื่อผู้ใช้แล้ว = ล็อก (เปลี่ยนต้องยื่นคำขอ) / ยังไม่ตั้ง = ตั้งเองได้ครั้งเดียว
  const locked = !!user.username;
  const [reqOpen, setReqOpen] = useState(false);
  const [reqMsg, setReqMsg] = useState('');
  const uCheck = useUsernameCheck(locked ? '' : form.username, '');
  const uBad = !locked && (uCheck.state === 'invalid' || uCheck.state === 'taken');
  const displayName = user.display_name || user.full_name || user.email;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy && !reqOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy, reqOpen]);

  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    setPhotoErr('');
    setPhotoBusy(true);
    try {
      setAvatarDraft(await resizeImage(file));
    } catch (e2) {
      setPhotoErr(e2.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const payload = { ...form };
      if (locked || !payload.username.trim()) delete payload.username; // ล็อกแล้ว / ยังไม่ตั้ง = ไม่ส่ง
      if (avatarDraft !== undefined) payload.avatar = avatarDraft; // null = ลบรูป
      await api.updateProfile(payload);
      await refreshProfile();
      onSaved('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="pm-overlay" data-profile-modal>
      <style>{css}</style>
      <form className="pm-box" role="dialog" aria-modal="true" aria-labelledby="pm-title" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h3 id="pm-title">แก้ไขโปรไฟล์</h3>
        {err && <div className="alert" data-pm-error style={{ marginBottom: 12 }}>{err}</div>}

        <div className="pm-photo" data-pm-photo>
          <Avatar src={shown} name={displayName} size={76} />
          <div className="pm-photo-side">
            <div className="pm-photo-row">
              <button type="button" className="btn btn-sm btn-light" data-pm-photo-btn disabled={busy || photoBusy} onClick={() => fileRef.current && fileRef.current.click()}>
                {photoBusy ? 'กำลังประมวลผลรูป...' : shown ? 'เปลี่ยนรูปโปรไฟล์' : 'เพิ่มรูปโปรไฟล์'}
              </button>
              {shown && !photoBusy && (
                <button type="button" className="pm-link" data-pm-photo-remove disabled={busy} onClick={() => { setAvatarDraft(null); setPhotoErr(''); }}>ลบรูป</button>
              )}
            </div>
            <div className="pm-hint">JPG, PNG หรือ WebP · ไม่เกิน 5MB</div>
            {photoErr && <div className="pm-photo-err" role="alert" data-pm-photo-err>{photoErr}</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden data-pm-file onChange={pickFile} />
        </div>

        <div className="pm-grid">
          <div>
            <label className="pm-label" htmlFor="pm-first">ชื่อ</label>
            <input id="pm-first" autoFocus value={form.first_name} onChange={setF('first_name')} maxLength={50} required />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-last">นามสกุล</label>
            <input id="pm-last" value={form.last_name} onChange={setF('last_name')} maxLength={50} required />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-nick">ชื่อเล่น</label>
            <input id="pm-nick" value={form.nickname} onChange={setF('nickname')} maxLength={30} />
          </div>
          <div>
            <div className="pm-label-row">
              <label className="pm-label" htmlFor="pm-user">ชื่อผู้ใช้</label>
              {locked && (
                <button type="button" className="pm-req" data-pm-username-req onClick={() => setReqOpen(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  ขอเปลี่ยน
                </button>
              )}
            </div>
            {locked ? (
              <>
                <div className="pm-locked">
                  <input id="pm-user" value={user.username} disabled data-pm-username />
                  <LockIcon />
                </div>
                {reqMsg && <div className="pm-hint" style={{ color: '#047857', marginTop: 4 }} data-pm-req-msg>{reqMsg}</div>}
              </>
            ) : (
              <>
                <input id="pm-user" value={form.username} onChange={setF('username')} maxLength={20} autoCapitalize="none" spellCheck={false} placeholder="ยังไม่ได้ตั้ง" data-pm-username />
                {uCheck.message && uCheck.state !== 'checking' ? (
                  <div className="pm-hint" style={{ color: uBad ? '#b91c1c' : '#047857' }} data-pm-username-msg>{uCheck.message}</div>
                ) : null}
                {form.username.trim() && <div className="pm-hint" style={{ color: '#B5530F' }} data-pm-username-warn>ตั้งแล้วเปลี่ยนเองไม่ได้ ตรวจให้ถูกก่อนบันทึก</div>}
              </>
            )}
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-email">อีเมล</label>
            <div className="pm-locked">
              <input id="pm-email" value={user.email} disabled />
              <LockIcon />
            </div>
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-birth">วันเกิด</label>
            <input id="pm-birth" type="date" value={form.birth_date} onChange={setF('birth_date')} />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-phone">เบอร์โทร</label>
            <input id="pm-phone" value={form.phone} onChange={setF('phone')} placeholder="เช่น 0812345678" />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-job">อาชีพ</label>
            <input id="pm-job" value={form.occupation} onChange={setF('occupation')} maxLength={100} />
          </div>
        </div>

        <div className="pm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn" data-pm-save disabled={busy || photoBusy || uBad}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
        </div>
      </form>
      {reqOpen && (
        <UsernameRequestModal currentUsername={user.username} onClose={() => setReqOpen(false)} onDone={(m) => setReqMsg(m)} />
      )}
    </div>,
    document.body
  );
}
