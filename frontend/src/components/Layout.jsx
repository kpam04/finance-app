
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

// รูปแบบ Avatar ของผู้ใช้งาน
const avatar = {
  width: 30,
  height: 30,
  minWidth: 30,
  borderRadius: '50%',
  background: '#e0e7ff',
  color: '#4338ca',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 600,
  fontSize: 14,
};

// รายการ "กลับหน้าผู้ดูแล" ในเมนูโปรไฟล์ของผู้ดูแล/เจ้าของ (โหมดใช้งานส่วนตัว) โทนเขียว Sage ให้เห็นเด่นกว่ารายการอื่นเล็กน้อย
const adminBackCss = `
.profile-dropdown-item.admin-back-item {
  background: #EFF3EB;
  color: #40563C;
  font-weight: 600;
}
.profile-dropdown-item.admin-back-item:hover {
  background: #E8EDE4;
}
.profile-dropdown-info .admin-mode-label {
  color: #5C7357;
}
`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ออกจากระบบและกลับไปหน้า Login
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ชื่อที่ใช้แสดงบน Header
  const name =
    (user && (user.display_name || user.full_name || user.email)) || '';

  const isAdmin =
    !!user && (user.role === 'admin' || user.role === 'owner');

  return (
    <div className="app">
      <style>{adminBackCss}</style>

      {/* ================= HEADER ================= */}
      <header className="topbar">

        {/* ชื่อแอป */}
        <div className="brand">
          💰 Finance App
        </div>

        {/* เมนูหลัก */}
        <nav className="main-nav">
          <NavLink to="/dashboard">แดชบอร์ด</NavLink>
          <NavLink to="/transactions">รายการ</NavLink>
          <NavLink to="/categories">หมวดหมู่</NavLink>
          <NavLink to="/budgets">งบประมาณ</NavLink>
          <NavLink to="/recurring">รายการซ้ำ</NavLink>
        </nav>

        {/* กระดิ่งและเมนูโปรไฟล์ */}
        <div className="user-box">

          {/* Notification */}
          <div className="notification-wrapper">
            <NotificationBell />
          </div>

          {/* Profile Dropdown */}
          <details className="profile-menu">

            <summary className="profile-trigger">

              <span style={avatar}>
                {name ? name.charAt(0).toUpperCase() : '?'}
              </span>

              <span className="profile-name">
                {name}
              </span>

              <span className="profile-arrow">
                ⌄
              </span>

            </summary>

            {/* เมนูภายในโปรไฟล์ */}
            <div className="profile-dropdown">

              <div className="profile-dropdown-header">

                <span style={avatar}>
                  {name ? name.charAt(0).toUpperCase() : '?'}
                </span>

                <div className="profile-dropdown-info">
                  <strong>{name}</strong>
                  {isAdmin ? (
                    <span className="admin-mode-label">
                      {user.role === 'owner' ? 'เจ้าของระบบ' : 'ผู้ดูแลระบบ'} · โหมดใช้งานส่วนตัว
                    </span>
                  ) : (
                    <span>บัญชีผู้ใช้งาน</span>
                  )}
                </div>

              </div>

              <div className="profile-dropdown-divider" />

              {/* ผู้ดูแล/เจ้าของ: กลับไปหน้าผู้ดูแลระบบ */}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className="profile-dropdown-item admin-back-item"
                  data-admin-link
                  onClick={(e) => {
                    e.currentTarget.closest('details').open = false;
                  }}
                >
                  <span>←</span>
                  กลับหน้าผู้ดูแล
                </NavLink>
              )}

              <NavLink
                to="/profile"
                className="profile-dropdown-item"
                onClick={(e) => {
                  e.currentTarget.closest('details').open = false;
                }}
              >
                <span>👤</span>
                โปรไฟล์ของฉัน
              </NavLink>

              <button
                type="button"
                className="profile-dropdown-item logout-item"
                onClick={handleLogout}
              >
                <span>🚪</span>
                ออกจากระบบ
              </button>

            </div>

          </details>

        </div>

      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="content">
        <Outlet />
      </main>

    </div>
  );
}
