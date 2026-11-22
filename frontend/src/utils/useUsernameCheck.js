import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { checkUsername } from './validators.js';

// ตรวจชื่อผู้ใช้ขณะพิมพ์: รูปแบบ (ทันที) + ว่างไหม (ถามเซิร์ฟเวอร์หลังหยุดพิมพ์ 400ms)
// current = ชื่อผู้ใช้เดิมของบัญชี (หน้าโปรไฟล์) ถ้าพิมพ์ชื่อเดิมถือว่าใช้ได้
// คืน { state: 'idle' | 'invalid' | 'checking' | 'ok' | 'taken', message }
export default function useUsernameCheck(value, current = '') {
  const [res, setRes] = useState({ state: 'idle', message: '' });
  useEffect(() => {
    const raw = (value || '').trim();
    if (!raw) { setRes({ state: 'idle', message: '' }); return undefined; }
    const r = checkUsername(raw);
    if (r.error) { setRes({ state: 'invalid', message: r.error }); return undefined; }
    if (current && r.value === current) { setRes({ state: 'ok', message: '' }); return undefined; }
    setRes({ state: 'checking', message: 'กำลังตรวจสอบ...' });
    let live = true;
    const t = setTimeout(() => {
      api.usernameAvailable(r.value)
        .then((x) => {
          if (!live) return;
          const d = (x && x.data) || {};
          setRes(d.available ? { state: 'ok', message: 'ใช้ชื่อนี้ได้' } : { state: 'taken', message: d.error || 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
        })
        .catch(() => { if (live) setRes({ state: 'idle', message: '' }); }); // ตรวจไม่ได้ ให้เซิร์ฟเวอร์ตัดสินตอนบันทึก
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [value, current]);
  return res;
}
