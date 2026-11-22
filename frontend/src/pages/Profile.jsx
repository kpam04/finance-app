import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrivacyModal from '../components/PrivacyModal.jsx';
import MyCategories from '../components/MyCategories.jsx';
import ProfileEditModal from '../components/ProfileEditModal.jsx';
import ChangePasswordModal from '../components/ChangePasswordModal.jsx';
import Avatar from '../components/Avatar.jsx';

const fmtShort = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH', { dateStyle: 'medium' });
};
const fmtDate = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH', { dateStyle: 'long' });
};

const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const field = { width: '100%', boxSizing: 'border-box' };
const okBox = { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };

// สไตล์หน้าโปรไฟล์: การ์ดโปรไฟล์ (ส่วนหัว + ข้อมูล + สถิติ) ปุ่มดินสอ/เปลี่ยนรหัสผ่านมุมขวาบน
const css = `
.pf-page { max-width: 1100px; margin: 0 auto; }
.pf-page .card { padding: 26px 32px; }
.pf-head { display: flex; gap: 22px; align-items: center; }
.pf-who { flex: 1 1 auto; min-width: 0; }
.pf-name { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 22px; font-weight: 700; line-height: 1.3; word-break: break-word; }
.pf-badge { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; }
.pf-user { font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid #CFDCC8; color: #4F6A4A; }
.pf-user .at { color: #9DB894; }
.pf-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 8px; font-size: 14px; color: #6b6358; }
.pf-meta > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; word-break: break-all; }
.pf-meta svg { flex: 0 0 auto; color: #8A8177; }
.pf-actions { display: flex; gap: 8px; flex: 0 0 auto; align-self: flex-start; }
.pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 12px; border: 1px solid var(--border, #E9E1D6); border-radius: 10px; background: #fff; color: #4b5563; font: inherit; font-size: 13px; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
.pf-btn:hover { background: #F6F2EA; border-color: #d8cfc0; color: #3F3A34; }
.pf-btn.icon { width: 38px; padding: 0; }
.pf-btn svg { flex: 0 0 auto; }
.pf-info { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 24px; margin-top: 24px; padding-top: 22px; border-top: 1px solid var(--border, #E9E1D6); }
.pf-fact { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pf-fact > div { min-width: 0; }
.pf-ico { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: #fff; border: 1px solid #EFE9DF; color: #74896F; }
.pf-label { font-size: 12.5px; color: #8A8177; margin-bottom: 1px; }
.pf-value { font-size: 15px; font-weight: 600; word-break: break-word; }
.pf-empty { color: #b3a99b; font-weight: 400; }
.pf-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }
.pf-stat { display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 12px; background: var(--bg, #F6F2EA); }
.pf-stat .pf-ico { width: 44px; height: 44px; border-radius: 12px; border: none; color: #5E7558; }
.pf-stat .n { font-size: 26px; font-weight: 700; line-height: 1.2; }
.pf-stat .l { font-size: 13px; color: #8A8177; }
.pf-policy { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 22px 0 0; padding-top: 16px; border-top: 1px solid var(--border, #E9E1D6); font-size: 12.5px; color: #8A8177; }
.pf-policy svg { flex: 0 0 auto; color: #9DB894; }
.pf-policy button { background: none; border: none; padding: 0; font: inherit; color: var(--primary-dark, #74896F); text-decoration: underline; cursor: pointer; }
@media (max-width: 900px) {
  .pf-info { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .pf-info { gap: 18px 16px; margin-top: 20px; padding-top: 18px; }
  .pf-value { font-size: 14px; }
  .pf-page .card { padding: 20px 18px; }
  .pf-head { flex-wrap: wrap; gap: 14px; }
  .pf-name { font-size: 20px; }
  .pf-actions { order: 3; width: 100%; justify-content: flex-end; }
  .pf-stats { gap: 10px; }
  .pf-stat { flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 14px; }
  .pf-stat .pf-ico { width: 34px; height: 34px; border-radius: 10px; }
  .pf-stat .n { font-size: 20px; }
  .pf-ico { width: 32px; height: 32px; }
}
`;

const IconPencil = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
);
const IconMail = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
const IconCalendar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
const IconLock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);

const svgP = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const IconUser = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...svgP}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>);
const IconPhone = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...svgP}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>);
const IconCake = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...svgP}><path d="M4 21h16v-8H4z" /><path d="M4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0" /><path d="M12 13V9" /><path d="M12 6v.01" /></svg>);
const IconBag = () => (<svg width="16" height="16" viewBox="0 0 24 24" {...svgP}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2" /></svg>);
const IconList = () => (<svg width="20" height="20" viewBox="0 0 24 24" {...svgP}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>);
const IconPie = () => (<svg width="20" height="20" viewBox="0 0 24 24" {...svgP}><path d="M21 12A9 9 0 1 1 12 3v9z" /></svg>);
const IconRepeat = () => (<svg width="20" height="20" viewBox="0 0 24 24" {...svgP}><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></svg>);
const IconShield = () => (<svg width="15" height="15" viewBox="0 0 24 24" {...svgP}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>);

export default function Profile() {
  const { user, stats, logout } = useAuth();
  const navigate = useNavigate();

  const [notice, setNotice] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  const [showPolicy, setShowPolicy] = useState(false);

  // ข้อความแจ้งผลสำเร็จหายเองหลังไม่กี่วินาที
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!user) return null; // user อาจยังเป็น null ชั่วขณะตอนโหลดข้อมูล

  const name = user.display_name || user.full_name || user.email;
  const isStaff = user.role === 'admin' || user.role === 'owner';

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDelErr('');
    if (!delPassword) return setDelErr('กรุณากรอกรหัสผ่านเพื่อยืนยัน');
    if (!window.confirm('ยืนยันลบบัญชีและข้อมูลทั้งหมดถาวร? ไม่สามารถกู้คืนได้')) return;

    setDelBusy(true);
    try {
      await api.deleteAccount(delPassword);
      logout();
      navigate('/login');
    } catch (e2) {
      setDelErr(e2.message);
      setDelBusy(false);
    }
  };

  const Info = ({ title, icon, children, empty }) => (
    <div className="pf-fact">
      <span className="pf-ico">{icon}</span>
      <div>
        <div className="pf-label">{title}</div>
        <div className={`pf-value${empty ? ' pf-empty' : ''}`}>{empty ? 'ยังไม่ระบุ' : children}</div>
      </div>
    </div>
  );
  const Stat = ({ title, icon, n }) => (
    <div className="pf-stat">
      <span className="pf-ico">{icon}</span>
      <div><div className="l">{title}</div><div className="n">{n}</div></div>
    </div>
  );

  return (
    <div className="pf-page">
      <style>{css}</style>
      <h2>โปรไฟล์ของฉัน</h2>

      {notice && (
        <div style={okBox} role="status" data-pf-notice>
          <span>{notice}</span>
          <button type="button" className="btn btn-sm btn-light" onClick={() => setNotice('')} aria-label="ปิดข้อความ">ปิด</button>
        </div>
      )}

      <div className="card" data-profile-card>
        <div className="pf-head">
          <Avatar src={user.avatar} name={name} size={88} alt={`รูปโปรไฟล์ของ ${name}`} style={{ border: '3px solid #fff', boxShadow: '0 0 0 1px #E9E1D6' }} />
          <div className="pf-who">
            <div className="pf-name">
              <span data-pf-name>{user.full_name || name}</span>
              {user.username && <span className="pf-user" data-pf-username><span className="at">@</span>{user.username}</span>}
              {isStaff && (
                <span className="pf-badge" data-role-badge style={{ background: user.role === 'owner' ? '#fef3c7' : '#e0e7ff', color: user.role === 'owner' ? '#92400e' : '#3730a3' }}>
                  {user.role === 'owner' ? 'เจ้าของระบบ' : 'ผู้ดูแลระบบ'}
                </span>
              )}
            </div>
            <div className="pf-meta">
              <span><IconMail />{user.email}</span>
              <span><IconCalendar />สมาชิกตั้งแต่ {fmtShort(user.created_at)}</span>
            </div>
          </div>
          <div className="pf-actions">
            <button type="button" className="pf-btn icon" data-edit-profile aria-label="แก้ไขโปรไฟล์" title="แก้ไขโปรไฟล์" onClick={() => { setNotice(''); setShowEdit(true); }}>
              <IconPencil />
            </button>
            <button type="button" className="pf-btn" data-change-password aria-label="เปลี่ยนรหัสผ่าน" title="เปลี่ยนรหัสผ่าน" onClick={() => { setNotice(''); setShowPassword(true); }}>
              <IconLock /><span>เปลี่ยนรหัสผ่าน</span>
            </button>
          </div>
        </div>

        <div className="pf-info" data-pf-info>
          <Info title="ชื่อเล่น" icon={<IconUser />} empty={!user.nickname}>{user.nickname}</Info>
          <Info title="เบอร์โทร" icon={<IconPhone />} empty={!user.phone}>{user.phone}</Info>
          <Info title="วันเกิด" icon={<IconCake />} empty={!user.birth_date}>{fmtDate(user.birth_date)}</Info>
          <Info title="อาชีพ" icon={<IconBag />} empty={!user.occupation}>{user.occupation}</Info>
        </div>

        {stats && (
          <div className="pf-stats" data-pf-stats>
            <Stat title="รายการทั้งหมด" icon={<IconList />} n={stats.total_transactions} />
            <Stat title="งบประมาณ" icon={<IconPie />} n={stats.total_budgets} />
            <Stat title="รายการประจำ" icon={<IconRepeat />} n={stats.total_recurring} />
          </div>
        )}

        <p className="pf-policy">
          <IconShield />
          {user.policy_accepted_at
            ? `ยอมรับนโยบายความเป็นส่วนตัวเมื่อ ${fmtDate(user.policy_accepted_at)} (เวอร์ชัน ${user.policy_version || '-'}) · `
            : 'ยังไม่มีบันทึกการยอมรับนโยบายความเป็นส่วนตัว · '}
          <button type="button" onClick={() => setShowPolicy(true)}>อ่านนโยบาย</button>
        </p>
      </div>

      {/* หมวดหมู่ของฉัน: เพิ่ม/แก้ไข/ลบ/แสดงอีกครั้ง */}
      <MyCategories />

      <div className="card" style={{ borderColor: '#fecaca' }}>
        <h3 style={{ marginTop: 0, color: '#b91c1c' }}>ลบบัญชี</h3>
        <p style={{ marginTop: 0 }}>
          การลบบัญชีจะลบ <strong>ข้อมูลทั้งหมดของคุณถาวร</strong> ได้แก่ รายการรายรับ-รายจ่าย งบประมาณ รายการประจำ
          การแจ้งเตือน หมวดหมู่ที่คุณสร้างเอง และข้อมูลโปรไฟล์ ไม่สามารถกู้คืนได้
        </p>
        {isStaff ? (
          <p data-staff-delete style={{ margin: 0, color: '#6b7280' }}>
            บัญชีผู้ดูแลระบบลบเองไม่ได้ ต้องให้เจ้าของลดสิทธิ์ก่อน (บัญชีเจ้าของต้องจัดการทางฐานข้อมูล)
          </p>
        ) : (
          <>
        {!showDelete ? (
          <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>ลบบัญชีของฉัน</button>
        ) : (
          <form onSubmit={deleteAccount}>
            {delErr && <div className="alert">{delErr}</div>}
            <label style={label}>กรอกรหัสผ่านเพื่อยืนยันการลบบัญชี</label>
            <input
              style={{ ...field, maxWidth: 320, marginBottom: 12 }}
              type="password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-light" onClick={() => { setShowDelete(false); setDelPassword(''); setDelErr(''); }} disabled={delBusy}>ยกเลิก</button>
              <button className="btn btn-danger" disabled={delBusy}>{delBusy ? 'กำลังลบ...' : 'ยืนยันลบบัญชีถาวร'}</button>
            </div>
          </form>
        )}
          </>
        )}
      </div>

      {showEdit && <ProfileEditModal user={user} onClose={() => setShowEdit(false)} onSaved={(m) => { setShowEdit(false); setNotice(m); }} />}
      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} onChanged={(m) => { setShowPassword(false); setNotice(m); }} />}
      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} />}
    </div>
  );
}
