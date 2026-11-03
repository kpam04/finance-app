
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import Avatar from './Avatar.jsx';

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


  return (
    <div className="app">

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

              <Avatar src={user && user.avatar} name={name} size={30} />

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

                <Avatar src={user && user.avatar} name={name} size={30} />

                <div className="profile-dropdown-info">
                  <strong>{name}</strong>
                  <span>บัญชีผู้ใช้งาน</span>
                </div>

              </div>

              <div className="profile-dropdown-divider" />

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
