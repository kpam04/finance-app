import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // ตำแหน่งกล่อง: null = ปกติ (ชิดขวาของปุ่มกระดิ่ง กว้าง 340px) / มีค่า = จอแคบ กล่องกว้างพอดีจอ เว้นขอบ 8px อยู่ใต้กระดิ่ง
  const [fit, setFit] = useState(null);

  // คำนวณตำแหน่งกล่อง: ถ้ากล่องปกติ (340px ชิดขวาปุ่ม) จะล้นขอบซ้ายของจอ ให้ใช้แบบพอดีจอแทน
  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const normalW = Math.min(340, vw * 0.9);
    if (r.right - normalW < 8) {
      const top = Math.round(r.bottom + 6);
      setFit({ top, left: 8, width: Math.max(200, vw - 16), maxH: Math.max(160, Math.min(380, window.innerHeight - top - 12)) });
    } else {
      setFit(null);
    }
  }, []);

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

  // เปิดกล่อง: คำนวณตำแหน่งก่อนแสดงผล (ไม่กระพริบ) และคำนวณใหม่เมื่อหมุนจอ/ย่อขยายหน้าต่าง/เลื่อนหน้า
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [open, place]);

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
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
    if (n.kind === 'installment') {
      setOpen(false);
      navigate('/plan?tab=installments');
    } else if (n.period_month && n.period_year) {
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
          data-bell-panel
          data-bell-mode={fit ? 'fit' : 'anchored'}
          style={{
            ...(fit
              ? { position: 'fixed', top: fit.top, left: fit.left, width: fit.width, maxHeight: fit.maxH }
              : { position: 'absolute', right: 0, top: '110%', width: 340, maxWidth: '90vw', maxHeight: 380 }),
            boxSizing: 'border-box', overflowY: 'auto', overflowX: 'hidden',
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
