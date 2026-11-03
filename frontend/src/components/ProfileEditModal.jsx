import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import { resizeImageToSquare } from '../utils/imageResize.js';

// ป๊อปอัป "แก้ไขโปรไฟล์" (เปิดจากปุ่มดินสอบนการ์ดโปรไฟล์): รูปโปรไฟล์ + ข้อมูลส่วนตัว
//  รูปที่เลือกยังไม่บันทึกทันที ต้องกด "บันทึกข้อมูล" (กด "ยกเลิก" รูปไม่เปลี่ยน)
const toForm = (u) => ({
  first_name: u.first_name || '',
  last_name: u.last_name || '',
  nickname: u.nickname || '',
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
.pm-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 520px) { .pm-grid { grid-template-columns: 1fr; } .pm-photo { align-items: flex-start; } }
`;

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
  const displayName = user.display_name || user.full_name || user.email;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

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
            <label className="pm-label" htmlFor="pm-nick">ชื่อเล่น (แสดงในเมนู)</label>
            <input id="pm-nick" value={form.nickname} onChange={setF('nickname')} maxLength={30} />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-email">อีเมล (เปลี่ยนไม่ได้)</label>
            <input id="pm-email" value={user.email} disabled />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-phone">เบอร์โทร</label>
            <input id="pm-phone" value={form.phone} onChange={setF('phone')} placeholder="เช่น 0812345678" />
          </div>
          <div>
            <label className="pm-label" htmlFor="pm-birth">วันเกิด</label>
            <input id="pm-birth" type="date" value={form.birth_date} onChange={setF('birth_date')} />
          </div>
          <div className="pm-wide">
            <label className="pm-label" htmlFor="pm-job">อาชีพ</label>
            <input id="pm-job" value={form.occupation} onChange={setF('occupation')} maxLength={100} />
          </div>
        </div>

        <div className="pm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn" data-pm-save disabled={busy || photoBusy}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
