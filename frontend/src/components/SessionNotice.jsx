import { useEffect, useState } from 'react';

// แสดงข้อความที่เก็บไว้ตอนถูกออกจากระบบ (เช่น บัญชีถูกระงับ / เซสชันถูกยกเลิก) วางในหน้าเข้าสู่ระบบ
// api.js เป็นคนเก็บข้อความไว้ใน sessionStorage (คีย์ finance_notice) แสดงครั้งเดียวแล้วลบ
export default function SessionNotice() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try {
      const m = sessionStorage.getItem('finance_notice');
      if (m) {
        setMsg(m);
        sessionStorage.removeItem('finance_notice');
      }
    } catch {
      /* ไม่มี sessionStorage ก็ข้าม */
    }
  }, []);

  if (!msg) return null;
  return (
    <div className="alert" role="status" style={{ marginBottom: 12, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
      <span>{msg}</span>
      <button type="button" aria-label="ปิดข้อความ" onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        ✕
      </button>
    </div>
  );
}
