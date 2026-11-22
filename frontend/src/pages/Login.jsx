import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import SessionNotice from '../components/SessionNotice.jsx';

// หน้าแรกหลังเข้าสู่ระบบ: ทุกบทบาทไปหน้าแดชบอร์ด (ยังไม่มีหน้าผู้ดูแลระบบ)
const landingFor = () => '/dashboard';

// แท็บที่ใช้ครั้งก่อน (จำไว้ในเบราว์เซอร์)
const MODE_KEY = 'finance_login_mode';
const readMode = () => {
  try { return localStorage.getItem(MODE_KEY) === 'email' ? 'email' : 'username'; } catch { return 'username'; }
};

const css = `
.lg-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 4px 0 16px; padding: 4px; border-radius: 12px; background: #F1EDE4; }
.lg-tab { padding: 8px 0; border: none; border-radius: 9px; background: transparent; font: inherit; font-size: 14px; color: #6b6358; cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
.lg-tab:hover { color: #3F3A34; }
.lg-tab.on { background: #fff; color: #40563C; font-weight: 600; box-shadow: 0 1px 3px rgba(60,48,36,.12); }
.lg-tab:focus-visible { outline: 2px solid #9AAB91; outline-offset: 1px; }
.lg-field input.bad { border-color: #D45C78 !important; box-shadow: 0 0 0 3px rgba(212,92,120,.12); }
.lg-err { display: flex; align-items: flex-start; gap: 5px; margin-top: 5px; font-size: 12.5px; line-height: 1.5; color: #B8304F; }
.lg-err svg { flex: none; margin-top: 2px; }
.lg-tip { display: block; margin-top: 2px; color: #8A8177; }
.lg-tip button { padding: 0; border: none; background: none; font: inherit; color: #5E7558; text-decoration: underline; cursor: pointer; }
`;

const ErrIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></svg>
);

export default function Login() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState(readMode); // 'username' | 'email'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(''); // ข้อผิดพลาดรวม (เช่น ล็อกอินผิดหลายครั้ง, เชื่อมต่อไม่ได้)
  const [fieldErr, setFieldErr] = useState({}); // { identifier?: { msg, code }, password?: { msg } }
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={landingFor(user)} replace />;

  const isEmail = mode === 'email';
  const label = isEmail ? 'อีเมล' : 'ชื่อผู้ใช้';

  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    setIdentifier('');
    setFieldErr({});
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    // ตรวจช่องว่างก่อนส่ง (ข้อความใต้ช่อง)
    const fe = {};
    if (!identifier.trim()) fe.identifier = { msg: `กรุณากรอก${label}` };
    if (!password) fe.password = { msg: 'กรุณากรอกรหัสผ่าน' };
    setFieldErr(fe);
    if (fe.identifier || fe.password) return;

    setBusy(true);
    try {
      await login(identifier.trim(), password, mode);
      try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
      // login() โหลดโปรไฟล์ไว้แล้ว: เมื่อ user ถูกตั้งค่า <Navigate> ด้านบนจะพาไปหน้าแรกเอง
    } catch (err) {
      const field = err.data && err.data.field;
      if (field === 'identifier' || field === 'password') setFieldErr({ [field]: { msg: err.message, code: err.code } });
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const idErr = fieldErr.identifier;
  const pwErr = fieldErr.password;

  return (
    <div className="auth-page">
      <style>{css}</style>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1>เข้าสู่ระบบ</h1>
        <SessionNotice />
        {error && <div className="alert" data-login-error>{error}</div>}

        <div className="lg-tabs" role="tablist" aria-label="วิธีเข้าสู่ระบบ">
          <button type="button" role="tab" aria-selected={!isEmail} className={`lg-tab${!isEmail ? ' on' : ''}`} data-login-tab="username" onClick={() => switchMode('username')}>ชื่อผู้ใช้</button>
          <button type="button" role="tab" aria-selected={isEmail} className={`lg-tab${isEmail ? ' on' : ''}`} data-login-tab="email" onClick={() => switchMode('email')}>อีเมล</button>
        </div>

        <label className="lg-field">
          {label}
          <input
            key={mode}
            type={isEmail ? 'email' : 'text'}
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); if (idErr) setFieldErr((f) => ({ ...f, identifier: undefined })); }}
            autoComplete={isEmail ? 'email' : 'username'}
            autoCapitalize="none"
            spellCheck={false}
            placeholder={isEmail ? 'name@example.com' : ''}
            className={idErr ? 'bad' : ''}
            aria-invalid={!!idErr}
            data-login-id
          />
          {idErr && (
            <span className="lg-err" role="alert" data-field-error="identifier">
              <ErrIcon />
              <span>
                {idErr.msg}
                {idErr.code === 'ACCOUNT_NOT_FOUND' && !isEmail && (
                  <span className="lg-tip">ถ้ายังไม่ได้ตั้งชื่อผู้ใช้ <button type="button" onClick={() => switchMode('email')}>ลองเข้าด้วยอีเมล</button></span>
                )}
              </span>
            </span>
          )}
        </label>

        <label className="lg-field">
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (pwErr) setFieldErr((f) => ({ ...f, password: undefined })); }}
            autoComplete="current-password"
            className={pwErr ? 'bad' : ''}
            aria-invalid={!!pwErr}
          />
          {pwErr && (
            <span className="lg-err" role="alert" data-field-error="password"><ErrIcon /><span>{pwErr.msg}</span></span>
          )}
        </label>

        <button className="btn" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
        <p className="muted">
          ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link>
        </p>
      </form>
    </div>
  );
}
