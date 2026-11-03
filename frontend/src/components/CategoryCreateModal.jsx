import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import ColorPalette from './ColorPalette.jsx';
import { DEFAULT_CATEGORY_COLOR, TYPE_LABEL } from '../utils/categoryColors.js';

// ป๊อปอัปสร้าง/แก้ไขหมวดหมู่ (ใช้ร่วมกันทุกที่)
//  - สร้างจากฟอร์ม: ส่ง type มา (ประเภทตามฟอร์ม แสดงเป็นข้อความ)
//  - สร้างจากการ์ด "หมวดหมู่ของฉัน": ไม่ส่ง type มา จะมีตัวเลือก รายจ่าย | รายรับ ในป๊อปอัป
//  - แก้ไข: ส่ง category มา (ใส่ค่าเดิมให้ แก้ได้เฉพาะชื่อและสี ประเภทแก้ไม่ได้) เรียก onSaved เมื่อบันทึก
//  - ตอนสร้างแสดงตัวนับ "ใช้อยู่ X/10 หมวด" และกันสร้างเมื่อครบเพดาน (หลังบ้านตรวจซ้ำอีกชั้น)
//  - ถ้าชื่อตรงกับหมวดที่ซ่อนอยู่ จะเสนอ "แสดงหมวดเดิมอีกครั้ง"
//  - แสดงผ่าน portal และกันเหตุการณ์ไม่ให้ลามไปปิดฟอร์มที่เปิดอยู่ข้างล่าง (คลิก/Esc/Enter)
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
.cm-seg { display: flex; gap: 0; margin: 0 0 14px; border: 1px solid #E9E1D6; border-radius: 10px; overflow: hidden; }
.cm-seg button { flex: 1; padding: 9px 12px; border: none; background: #fff; color: #6b7280; font: inherit; font-size: 14px; cursor: pointer; }
.cm-seg button + button { border-left: 1px solid #E9E1D6; }
.cm-seg button[aria-checked='true'] { background: #E8EDE4; color: #40563C; font-weight: 600; }
.cm-seg button:disabled { cursor: not-allowed; opacity: 0.7; }
`;

export default function CategoryCreateModal({ type, category, onCreated, onSaved, onClose }) {
  const editing = !!category;
  const freeType = !editing && !type;
  const [pickedType, setPickedType] = useState('expense');
  const effType = editing ? category.type : (type || pickedType);

  const [name, setName] = useState(editing ? category.name : '');
  const [color, setColor] = useState(editing ? category.color || DEFAULT_CATEGORY_COLOR : DEFAULT_CATEGORY_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hiddenId, setHiddenId] = useState(null);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    if (editing) return undefined;
    let alive = true;
    api
      .getMyCategories()
      .then((r) => { if (alive) setMeta(r.meta || null); })
      .catch(() => { /* ตัวนับเป็นข้อมูลเสริม โหลดไม่ได้ก็ใช้ต่อได้ */ });
    return () => { alive = false; };
  }, [editing]);

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

  const full = !editing && !!meta && meta.custom_active >= meta.max_active;
  const normalize = (data) => ({ ...data, category_id: String(data.category_id) });

  const submit = async () => {
    if (busy) return;
    const clean = name.trim();
    if (!clean) { setError('กรุณาตั้งชื่อหมวดหมู่'); return; }
    setBusy(true);
    setError('');
    setHiddenId(null);
    try {
      if (editing) {
        const res = await api.updateCategory(category.category_id, { name: clean, color });
        if (onSaved) onSaved(normalize(res.data));
      } else {
        const res = await api.createCategory({ name: clean, type: effType, color });
        onCreated(normalize(res.data));
      }
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
        <h3 id="cm-title">{editing ? 'แก้ไขหมวดหมู่' : 'สร้างหมวดหมู่ใหม่'}</h3>

        {freeType ? (
          <div style={{ marginTop: 10 }}>
            <span className="cm-label">ประเภท</span>
            <div className="cm-seg" role="radiogroup" aria-label="ประเภทของหมวดหมู่" data-type-toggle>
              {['expense', 'income'].map((t) => (
                <button key={t} type="button" role="radio" aria-checked={pickedType === t} data-type-option={t} disabled={busy} onClick={() => setPickedType(t)}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="cm-sub" data-type-label>
            ประเภท: <strong>{TYPE_LABEL[effType] || effType}</strong>
            {editing ? ' (เปลี่ยนประเภทไม่ได้)' : ''}
          </p>
        )}

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

        {meta && !editing && (
          <p className={`cm-count${full ? ' full' : ''}`} data-count>
            {full
              ? `ใช้หมวดของตัวเองครบ ${meta.max_active} หมวดแล้ว ลบหรือซ่อนหมวดที่ไม่ใช้ก่อน (โปรไฟล์ > หมวดหมู่ของฉัน)`
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
            {busy ? (editing ? 'กำลังบันทึก...' : 'กำลังสร้าง...') : (editing ? 'บันทึก' : 'สร้างหมวดหมู่')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
