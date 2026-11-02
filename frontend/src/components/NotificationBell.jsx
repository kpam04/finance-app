import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import NotificationList from './NotificationList.jsx';

// กระดิ่งแจ้งเตือน: วางในแถบเมนูด้านบน (Layout.jsx)
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      setItems(res.data);
      setUnread(typeof res.unread_count === 'number' ? res.unread_count : res.data.filter((n) => !n.is_read).length);
    } catch {
      /* ไม่แสดง error ของกระดิ่ง (ถ้า 401 api.js จัดการออกจากระบบให้แล้ว) */
    }
  }, []);

  // โหลดตอนเปิดหน้า และรีเฟรชทุก 60 วินาที
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // รีเฟรชทันทีเมื่อหน้าอื่นแจ้งว่าอาจมีการแจ้งเตือนใหม่ (เช่น บันทึกรายจ่ายแล้วใช้งบถึงเกณฑ์)
  useEffect(() => {
    window.addEventListener('notifications:refresh', load);
    return () => window.removeEventListener('notifications:refresh', load);
  }, [load]);

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    if (!open) load();
    setOpen(!open);
  };

  const markRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      await load();
    } catch {
      /* ignore */
    }
  };

  // กดการแจ้งเตือน: ทำเครื่องหมายอ่านแล้ว และพาไปหน้างบประมาณของเดือน/ปีนั้น (ถ้างบยังอยู่)
  const select = async (n) => {
    if (!n.is_read) await markRead(n.notification_id);
    if (n.period_month && n.period_year) {
      setOpen(false);
      navigate(`/budgets?month=${n.period_month}&year=${n.period_year}`);
    }
  };

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={toggle}
        aria-label="การแจ้งเตือน"
        style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, padding: '4px 8px' }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
              background: '#dc2626', color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 4px',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '110%', width: 340, maxWidth: '90vw', maxHeight: 380, overflowY: 'auto',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
            padding: 12, zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong>การแจ้งเตือน</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-sm btn-light" onClick={markAll}>
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <NotificationList items={items} onRead={markRead} onSelect={select} />
        </div>
      )}
    </div>
  );
}
