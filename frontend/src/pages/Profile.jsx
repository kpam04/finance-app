import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrivacyModal from '../components/PrivacyModal.jsx';
import { checkPassword } from '../utils/validators.js';

const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'GBP', 'CNY'];

const fmtDate = (s) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH', { dateStyle: 'long' });
};

const toForm = (u) => ({
  first_name: u.first_name || '',
  last_name: u.last_name || '',
  nickname: u.nickname || '',
  phone: u.phone || '',
  birth_date: u.birth_date || '',
  occupation: u.occupation || '',
  monthly_income: u.monthly_income === null || u.monthly_income === undefined ? '' : String(u.monthly_income),
  currency: u.currency || 'THB',
});

const label = { display: 'block', fontSize: 13, marginBottom: 4, color: '#4b5563' };
const field = { width: '100%', boxSizing: 'border-box' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 };
const okBox = { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12 };

export default function Profile() {
  const { user, stats, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => toForm(user || {})); // user อาจยังเป็น null ชั่วขณะตอนโหลดข้อมูล
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm_new_password: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delErr, setDelErr] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  const [showPolicy, setShowPolicy] = useState(false);

  // เมื่อข้อมูลผู้ใช้โหลดใหม่ (เช่น หลังบันทึก) ให้ฟอร์มตรงกับข้อมูลล่าสุด
  useEffect(() => {
    if (user) setForm(toForm(user));
  }, [user]);

  if (!user) return null;

  const name = user.display_name || user.full_name || user.email;
  const isStaff = user.role === 'admin' || user.role === 'owner';
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const currencyOptions = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES];

  const saveProfile = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setBusy(true);
    try {
      await api.updateProfile({ ...form });
      await refreshProfile();
      setMsg('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    const check = checkPassword(pw.new_password, 'รหัสผ่านใหม่');
    if (check.error) return setPwErr(check.error);
    if (pw.new_password !== pw.confirm_new_password) return setPwErr('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');

    setPwBusy(true);
    try {
      const res = await api.updateProfile({ ...pw });
      // เปลี่ยนรหัสผ่านแล้ว token เดิมใช้ไม่ได้ทุกเครื่อง backend ส่ง token ใหม่มาให้เครื่องนี้ใช้ต่อ
      if (res && res.token) setToken(res.token);
      setPw({ current_password: '', new_password: '', confirm_new_password: '' });
      setPwMsg('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    } catch (e2) {
      setPwErr(e2.message);
    } finally {
      setPwBusy(false);
    }
  };

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

  return (
    <div>
      <h2>โปรไฟล์ของฉัน</h2>

      <div className="card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%', background: '#e0e7ff', color: '#4338ca',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {user.full_name || name}
              {isStaff && (
                <span data-role-badge style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: user.role === 'owner' ? '#fef3c7' : '#e0e7ff', color: user.role === 'owner' ? '#92400e' : '#3730a3' }}>
                  {user.role === 'owner' ? 'เจ้าของระบบ' : 'ผู้ดูแลระบบ'}
                </span>
              )}
            </div>
            <div style={{ color: '#6b7280' }}>{user.email}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>สมาชิกตั้งแต่ {fmtDate(user.created_at)}</div>
          </div>
        </div>

        {stats && (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
            <div><div style={{ fontSize: 13, color: '#6b7280' }}>รายการทั้งหมด</div><strong style={{ fontSize: 20 }}>{stats.total_transactions}</strong></div>
            <div><div style={{ fontSize: 13, color: '#6b7280' }}>งบประมาณ</div><strong style={{ fontSize: 20 }}>{stats.total_budgets}</strong></div>
            <div><div style={{ fontSize: 13, color: '#6b7280' }}>รายการซ้ำ</div><strong style={{ fontSize: 20 }}>{stats.total_recurring}</strong></div>
          </div>
        )}

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 0 }}>
          {user.policy_accepted_at
            ? `ยอมรับนโยบายความเป็นส่วนตัวเมื่อ ${fmtDate(user.policy_accepted_at)} (เวอร์ชัน ${user.policy_version || '-'}) `
            : 'ยังไม่มีบันทึกการยอมรับนโยบายความเป็นส่วนตัว '}
          <button
            type="button"
            onClick={() => setShowPolicy(true)}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#4f46e5', textDecoration: 'underline', cursor: 'pointer' }}
          >
            อ่านนโยบาย
          </button>
        </p>
      </div>

      <form className="card" onSubmit={saveProfile}>
        <h3 style={{ marginTop: 0 }}>ข้อมูลส่วนตัว</h3>
        {!user.last_name && (
          <div className="alert">บัญชีนี้ยังไม่มีนามสกุล กรุณากรอกนามสกุลแล้วกดบันทึก</div>
        )}
        {err && <div className="alert">{err}</div>}
        {msg && <div style={okBox}>{msg}</div>}

        <div style={grid}>
          <div>
            <label style={label}>ชื่อ</label>
            <input style={field} value={form.first_name} onChange={setF('first_name')} maxLength={50} required />
          </div>
          <div>
            <label style={label}>นามสกุล</label>
            <input style={field} value={form.last_name} onChange={setF('last_name')} maxLength={50} required />
          </div>
          <div>
            <label style={label}>ชื่อเล่น (แสดงในเมนู)</label>
            <input style={field} value={form.nickname} onChange={setF('nickname')} maxLength={30} />
          </div>
          <div>
            <label style={label}>อีเมล (เปลี่ยนไม่ได้)</label>
            <input style={field} value={user.email} disabled />
          </div>
          <div>
            <label style={label}>เบอร์โทร</label>
            <input style={field} value={form.phone} onChange={setF('phone')} placeholder="เช่น 0812345678" />
          </div>
          <div>
            <label style={label}>วันเกิด</label>
            <input style={field} type="date" value={form.birth_date} onChange={setF('birth_date')} />
          </div>
          <div>
            <label style={label}>อาชีพ</label>
            <input style={field} value={form.occupation} onChange={setF('occupation')} maxLength={100} />
          </div>
          <div>
            <label style={label}>รายได้ต่อเดือนโดยประมาณ</label>
            <input style={field} type="number" min="0" step="0.01" value={form.monthly_income} onChange={setF('monthly_income')} />
          </div>
          <div>
            <label style={label}>สกุลเงิน</label>
            <select style={field} value={form.currency} onChange={setF('currency')}>
              {currencyOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 0 }}>
          ช่องที่ไม่บังคับ (ชื่อเล่น เบอร์โทร วันเกิด อาชีพ รายได้) เว้นว่างได้ รายได้ใช้ประกอบการวิเคราะห์และวางแผนการเงินของคุณเท่านั้น
        </p>
        <button className="btn" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button>
      </form>

      <form className="card" onSubmit={changePassword}>
        <h3 style={{ marginTop: 0 }}>เปลี่ยนรหัสผ่าน</h3>
        {pwErr && <div className="alert">{pwErr}</div>}
        {pwMsg && <div style={okBox}>{pwMsg}</div>}
        <div style={grid}>
          <div>
            <label style={label}>รหัสผ่านปัจจุบัน</label>
            <input style={field} type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
          </div>
          <div>
            <label style={label}>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
            <input style={field} type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required />
          </div>
          <div>
            <label style={label}>ยืนยันรหัสผ่านใหม่</label>
            <input style={field} type="password" value={pw.confirm_new_password} onChange={(e) => setPw({ ...pw, confirm_new_password: e.target.value })} required />
          </div>
        </div>
        <button className="btn" disabled={pwBusy}>{pwBusy ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}</button>
      </form>

      <div className="card" style={{ borderColor: '#fecaca' }}>
        <h3 style={{ marginTop: 0, color: '#b91c1c' }}>ลบบัญชี</h3>
        <p style={{ marginTop: 0 }}>
          การลบบัญชีจะลบ <strong>ข้อมูลทั้งหมดของคุณถาวร</strong> ได้แก่ รายการรายรับ-รายจ่าย งบประมาณ รายการที่เกิดซ้ำ
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

      {showPolicy && <PrivacyModal onClose={() => setShowPolicy(false)} />}
    </div>
  );
}
