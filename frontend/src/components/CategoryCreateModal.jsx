import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import ColorPalette from './ColorPalette.jsx';
import { DEFAULT_CATEGORY_COLOR, TYPE_LABEL } from '../utils/categoryColors.js';

// ป๊อปอัปสร้างหมวดหมู่ใหม่ (ประเภทถูกกำหนดจากฟอร์มที่เปิดมา: รายจ่ายหรือรายรับ)
// - แสดงตัวนับ "ใช้อยู่ X/10 หมวด" และกันสร้างเมื่อครบเพดาน (ระบบหลังบ้านตรวจซ้ำอีกชั้น)
// - ถ้าชื่อตรงกับหมวดที่ซ่อนอยู่ จะเสนอ "แสดงหมวดเดิมอีกครั้ง"
// - แสดงผ่าน portal และกันเหตุการณ์ไม่ให้ลามไปปิดฟอร์มที่เปิดอยู่ข้างล่าง (คลิก/Esc/Enter)
const css = `
.cm-overlay { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.45); }
.cm-box { width: 420px; max-width: 100%; max-height: 92vh; overflow-y: auto; box-sizing: border-box; padding: 22px; border-radius: 14px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25); }
.cm-box h3 { margin: 0 0 4px; }
.cm-sub { margin: 0 0 14px; font-size: 13px; color: #6b7280; }
.cm-label { display: block; margin: 0 0 4px; font-size: 13px; color: #4b5563; }
.cm-count { margin: 12px 0 0; font-size: 12px; color: #6b7280; }
.cm-count.full { color: #b45309; }
.cm-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.cm-error { margin: 12px 0 0; }
`;

export default function CategoryCreateModal({ type, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hiddenId, setHiddenId] = useState(null);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .getMyCategories()
      .then((r) => { if (alive) setMeta(r.meta || null); })
      .catch(() => { /* ตัวนับเป็นข้อมูลเสริม โหลดไม่ได้ก็ใช้ต่อได้ */ });
    return () => { alive = false; };
  }, []);

  // Esc ปิดเฉพาะป๊อปอัปนี้ (ดักตั้งแต่ขั้น capture กันไม่ให้ฟอร์มข้างล่างปิดตามไปด้วย)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const full = !!meta && meta.custom_active >= meta.max_active;
  const normalize = (data) => ({ ...data, category_id: String(data.category_id) });

  const submit = async () => {
    if (busy) return;
    const clean = name.trim();
    if (!clean) { setError('กรุณาตั้งชื่อหมวดหมู่'); return; }
    setBusy(true);
    setError('');
    setHiddenId(null);
    try {
      const res = await api.createCategory({ name: clean, type, color });
      onCreated(normalize(res.data));
    } catch (e) {
      setError(e.message);
      if (e.code === 'HIDDEN_EXISTS' && e.data && e.data.category_id) setHiddenId(String(e.data.category_id));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy || !hiddenId) return;
    setBusy(true);
    try {
      const res = await api.restoreCategory(hiddenId);
      onCreated(normalize(res.data));
    } catch (e) {
      setError(e.message);
      setHiddenId(null);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="cm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cm-title"
      data-category-modal
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <style>{css}</style>
      <div className="cm-box" onClick={(e) => e.stopPropagation()}>
        <h3 id="cm-title">สร้างหมวดหมู่ใหม่</h3>
        <p className="cm-sub" data-type-label>ประเภท: <strong>{TYPE_LABEL[type] || type}</strong></p>

        <label className="cm-label" htmlFor="cm-name">ชื่อหมวดหมู่</label>
        <input
          id="cm-name"
          autoFocus
          maxLength={40}
          value={name}
          placeholder="เช่น ค่าขนมลูก"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
          }}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14 }}
        />

        <span className="cm-label">สี</span>
        <ColorPalette value={color} onChange={setColor} disabled={busy} />

        {meta && (
          <p className={`cm-count${full ? ' full' : ''}`} data-count>
            {full
              ? `ใช้หมวดของตัวเองครบ ${meta.max_active} หมวดแล้ว ไปลบหรือซ่อนหมวดที่ไม่ใช้ได้ที่โปรไฟล์ > หมวดหมู่ของฉัน`
              : `ใช้อยู่ ${meta.custom_active}/${meta.max_active} หมวด`}
          </p>
        )}

        {error && (
          <div className="alert cm-error" data-cm-error>
            {error}
            {hiddenId && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm btn-light" data-restore-hidden onClick={restore} disabled={busy}>
                  แสดงหมวดเดิมอีกครั้ง
                </button>
              </div>
            )}
          </div>
        )}

        <div className="cm-actions">
          <button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn" data-create-submit onClick={submit} disabled={busy || full}>
            {busy ? 'กำลังสร้าง...' : 'สร้างหมวดหมู่'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
