import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// เตือนตอนบันทึกเมื่อยอดสูงผิดปกติของหมวดนั้น (เทียบรายการของผู้ใช้เองย้อนหลัง 90 วัน: มัธยฐาน + IQR คำนวณที่หลังบ้าน)
//  แค่เตือน ไม่บล็อกการบันทึก ไม่มีปุ่ม / ส่ง flag ไปเก็บเป็นสถิติ: warned = บันทึกตอนมีคำเตือน, corrected = เคยขึ้นเตือนแล้วแก้ยอดจนหาย
let cache = null;
let cachedAt = 0;
const CACHE_MS = 60000;
function loadTypical() {
  if (!api || typeof api.getTypicalAmounts !== 'function') return Promise.resolve({});
  if (!cache || Date.now() - cachedAt > CACHE_MS) {
    cachedAt = Date.now();
    cache = api.getTypicalAmounts().then((r) => (r && r.data) || {}).catch(() => ({}));
  }
  return cache;
}
// หลังบันทึกรายการ ค่าปกติอาจเปลี่ยน: ให้โหลดใหม่ครั้งถัดไป
export const resetTypical = () => { cache = null; };

export function unusualOf(stats, type, categoryId, amount) {
  if (type !== 'expense' || !stats || !categoryId) return null;
  const s = stats[String(categoryId)];
  const a = Number(amount);
  return s && a > 0 && a > s.threshold ? { median: s.median } : null;
}

// resetKey เปลี่ยน (เปิดฟอร์มใหม่/รายการใหม่) = เริ่มนับใหม่ว่าเคยเตือนหรือยัง
export function useUnusual(type, categoryId, amount, resetKey) {
  const [stats, setStats] = useState(null);
  const seen = useRef(false);
  useEffect(() => {
    let live = true;
    loadTypical().then((s) => { if (live) setStats(s); });
    return () => { live = false; };
  }, []);
  useEffect(() => { seen.current = false; }, [resetKey]);
  const info = unusualOf(stats, type, categoryId, amount);
  if (info) seen.current = true;
  const flag = info ? 'warned' : seen.current ? 'corrected' : undefined;
  return { info, flag };
}


export default function UnusualHint({ info }) {
  if (!info) return null;
  return (
    <div className="uh-box" role="status" data-unusual-hint>
      <style>{css}</style>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
      <span>ยอดนี้สูงกว่าปกติของหมวดนี้มาก ตรวจตัวเลขอีกครั้ง</span>
    </div>
  );
}

const css = `
.uh-box { display: flex; align-items: flex-start; gap: 7px; margin-top: 6px; padding: 7px 10px; border-radius: 9px; background: #FBF1E8; color: #8A4B26; font-size: 12.5px; line-height: 1.5; text-align: left; }
.uh-box svg { flex: none; margin-top: 2px; }

`;
