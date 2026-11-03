import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import SessionNotice from '../components/SessionNotice.jsx';

// หน้าแรกหลังเข้าสู่ระบบ: ทุกบทบาทไปหน้าแดชบอร์ด (ยังไม่มีหน้าผู้ดูแลระบบ)
const landingFor = () => '/dashboard';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={landingFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      // login() โหลดโปรไฟล์ (รวมบทบาท) ไว้แล้ว: เมื่อ user ถูกตั้งค่า บรรทัด <Navigate> ด้านบนจะพาไปหน้าที่ตรงกับบทบาทเอง
      // navigate('/dashboard') แบบตายตัวถูกเอาออก เพราะจะพาผู้ดูแลไปผิดหน้า
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>เข้าสู่ระบบ</h1>
          <SessionNotice />
        {error && <div className="alert">{error}</div>}
        <label>
          อีเมล
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
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
