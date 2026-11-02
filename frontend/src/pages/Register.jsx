import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PrivacyModal from '../components/PrivacyModal.jsx';
import {
  checkName,
  checkEmail,
  checkSignupEmail,
  checkPassword,
  suggestEmailFix,
  passwordLength,
  ALLOWED_EMAIL_DOMAINS,
} from '../utils/validators.js';

const linkBtn = {
  background: 'none', border: 'none', padding: 0, font: 'inherit',
  color: '#4f46e5', textDecoration: 'underline', cursor: 'pointer',
};
const errStyle = { color: '#b91c1c', fontSize: 12, marginTop: 4, display: 'block' };
const okStyle = { color: '#047857', fontSize: 12, marginTop: 4, display: 'block' };
const hintStyle = { color: '#6b7280', fontSize: 12, marginTop: 4, display: 'block' };

// ตรวจทุกช่อง คืนเป็น { ชื่อช่อง: ข้อความผิดพลาด } (กติกาเดียวกับ backend)
function validate(form) {
  const e = {};
  const fn = checkName(form.first_name, 'ชื่อ');
  if (fn.error) e.first_name = fn.error;
  const ln = checkName(form.last_name, 'นามสกุล');
  if (ln.error) e.last_name = ln.error;
  const em = checkSignupEmail(form.email);
  if (em.error) e.email = em.error;
  const pw = checkPassword(form.password);
  if (pw.error) e.password = pw.error;
  if (!form.confirm_password) e.confirm_password = 'กรุณายืนยันรหัสผ่าน';
  else if (form.confirm_password !== form.password) e.confirm_password = 'รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน';
  if (!form.accept_policy) e.accept_policy = 'กรุณายอมรับนโยบายความเป็นส่วนตัว';
  return e;
}

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
    accept_policy: false,
  });
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/transactions" replace />;

  const errors = validate(form);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const shown = (k) => (touched[k] || submitted ? errors[k] : undefined);

  const pwLen = passwordLength(form.password);
  // แนะนำเมื่อรูปแบบอีเมลถูกต้อง แต่โดเมนใกล้เคียงโดเมนที่รองรับ (เช่น gail.com -> gmail.com)
  const suggestion = checkEmail(form.email).value ? suggestEmailFix(form.email) : null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      await register({
        first_name: checkName(form.first_name, 'ชื่อ').value,
        last_name: checkName(form.last_name, 'นามสกุล').value,
        email: checkSignupEmail(form.email).value,
        password: form.password,
        confirm_password: form.confirm_password,
        accept_policy: true,
      });
      navigate('/transactions');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1>สมัครสมาชิก</h1>
        {error && <div className="alert">{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>
            ชื่อ
            <input
              value={form.first_name}
              onChange={set('first_name')}
              onBlur={blur('first_name')}
              maxLength={50}
              autoComplete="given-name"
            />
            {shown('first_name') && <small style={errStyle} data-error="first_name">{errors.first_name}</small>}
          </label>
          <label>
            นามสกุล
            <input
              value={form.last_name}
              onChange={set('last_name')}
              onBlur={blur('last_name')}
              maxLength={50}
              autoComplete="family-name"
            />
            {shown('last_name') && <small style={errStyle} data-error="last_name">{errors.last_name}</small>}
          </label>
        </div>

        <label>
          อีเมล
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            onBlur={blur('email')}
            placeholder="name@example.com"
            autoComplete="email"
          />
          {shown('email') ? (
            <small style={errStyle} data-error="email">{errors.email}</small>
          ) : (
            <small style={hintStyle} data-hint="email-domains">
              รองรับเฉพาะอีเมลจาก {ALLOWED_EMAIL_DOMAINS.join(', ')}
            </small>
          )}
          {suggestion && (
            <small style={hintStyle} data-hint="email-suggestion">
              คุณหมายถึง{' '}
              <button type="button" style={linkBtn} onClick={() => setForm({ ...form, email: suggestion })}>
                {suggestion}
              </button>{' '}
              ใช่ไหม?
            </small>
          )}
        </label>

        <label>
          รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)
          <input
            type={showPw ? 'text' : 'password'}
            value={form.password}
            onChange={set('password')}
            onBlur={blur('password')}
            autoComplete="new-password"
          />
          {shown('password') ? (
            <small style={errStyle} data-error="password">{errors.password}</small>
          ) : (
            <small style={pwLen >= 8 ? okStyle : hintStyle} data-hint="password-count">
              {pwLen >= 8 ? `✓ ครบ 8 ตัวอักษรแล้ว (${pwLen} ตัว)` : `ตอนนี้ ${pwLen} ตัวอักษร (ต้องมีอย่างน้อย 8)`}
            </small>
          )}
        </label>

        <label>
          ยืนยันรหัสผ่าน
          <input
            type={showPw ? 'text' : 'password'}
            value={form.confirm_password}
            onChange={set('confirm_password')}
            onBlur={blur('confirm_password')}
            autoComplete="new-password"
          />
          {shown('confirm_password') ? (
            <small style={errStyle} data-error="confirm_password">{errors.confirm_password}</small>
          ) : (
            form.confirm_password && !errors.confirm_password && (
              <small style={okStyle} data-hint="confirm-match">✓ รหัสผ่านตรงกัน</small>
            )
          )}
        </label>

        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          แสดงรหัสผ่าน
        </label>

        <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            style={{ width: 'auto', marginTop: 4 }}
            checked={form.accept_policy}
            onChange={(e) => setForm({ ...form, accept_policy: e.target.checked })}
          />
          <span>
            ฉันได้อ่านและยอมรับ{' '}
            <button type="button" style={linkBtn} onClick={() => setShowPolicy(true)}>
              นโยบายความเป็นส่วนตัว
            </button>
          </span>
        </label>
        {submitted && errors.accept_policy && <small style={errStyle} data-error="accept_policy">{errors.accept_policy}</small>}

        <button className="btn" disabled={busy || !form.accept_policy}>
          {busy ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
        </button>
        <p className="muted">
          มีบัญชีแล้ว? <Link to="/login">เข้าสู่ระบบ</Link>
        </p>
      </form>

      {showPolicy && (
        <PrivacyModal
          onClose={() => setShowPolicy(false)}
          onAccept={() => {
            setForm((f) => ({ ...f, accept_policy: true }));
            setShowPolicy(false);
          }}
        />
      )}
    </div>
  );
}
