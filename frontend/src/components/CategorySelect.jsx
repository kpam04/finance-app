import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CategoryCreateModal from './CategoryCreateModal.jsx';

const NEW_VALUE = '__new__';
const OTHERS_NAME = 'อื่นๆ';
const MAX_PANEL = 300; // ความสูงสูงสุดของกล่องรายการ (พิกเซล) รวมแถบ "+ สร้างหมวดใหม่…" ด้านล่าง
const FOOTER = 48; // ความสูงโดยประมาณของแถบ "+ สร้างหมวดใหม่…"
const MIN_LIST = 120;

// เรียงหมวดสำหรับรายการเลือก: "อื่นๆ" (หมวดมาตรฐาน) อยู่ท้ายสุดเสมอ ต่อจากหมวดมาตรฐานอื่นและหมวดที่ผู้ใช้สร้างเอง
export function orderForPicker(list) {
  const isOthers = (c) => !!c.is_default && c.name === OTHERS_NAME;
  return [...list.filter((c) => !isOthers(c)), ...list.filter(isOthers)];
}

// สไตล์ช่องเลือกหมวดหมู่ (รายการแบบกำหนดเอง: มีแถบเลื่อน ความสูงไม่เกินการ์ดที่เปิดอยู่ และแถบ "+ สร้างหมวดใหม่…" ติดด้านล่างเสมอ)
const css = `
.cs-wrap { position: relative; width: 100%; }
.cs-native { position: absolute; left: 0; bottom: 0; width: 100%; height: 1px; min-height: 0; padding: 0; border: 0; opacity: 0; pointer-events: none; }
.cs-button { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 42px; padding: 9px 12px; box-sizing: border-box; border: 1px solid var(--border, #E9E1D6); border-radius: var(--radius-sm, 8px); background: #fff; color: var(--text, #3F3A34); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
.cs-button:hover:not(:disabled) { border-color: #cfc8ba; }
.cs-button:focus-visible, .cs-wrap.open .cs-button { outline: none; border-color: var(--primary, #9AAB91); box-shadow: 0 0 0 3px rgba(145, 166, 138, 0.2); }
.cs-button:disabled { opacity: 0.6; cursor: not-allowed; background: #f6f2ea; }
.cs-value { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-value.placeholder { color: #9ca3af; }
.cs-chevron { flex: 0 0 auto; color: #8A8177; transition: transform 0.15s ease; }
.cs-wrap.open .cs-chevron { transform: rotate(180deg); }
.cs-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 10px; }
.cs-panel { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 40; display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; background: #fff; border: 1px solid var(--border, #E9E1D6); border-radius: 12px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16); }
.cs-panel.up { top: auto; bottom: calc(100% + 4px); }
/* แถบเลื่อนมินิมอล: แคปซูลลอยสีเสจ ไม่มีราง ห่างขอบและมุมกล่อง (Firefox ใช้ได้แค่ความบาง + สี) */
.cs-list { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 4px; scrollbar-width: thin; scrollbar-color: #9AAB91 transparent; }
.cs-list::-webkit-scrollbar { width: 11px; }
.cs-list::-webkit-scrollbar-track { background: transparent; margin: 10px 0; }
.cs-list::-webkit-scrollbar-thumb { background: #9AAB91; border-radius: 999px; border: 2px solid transparent; border-left-width: 3px; background-clip: padding-box; min-height: 28px; }
.cs-list::-webkit-scrollbar-thumb:hover { background: #74896F; border: 2px solid transparent; border-left-width: 3px; background-clip: padding-box; }
.cs-option { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 8px; cursor: pointer; font-size: 14px; line-height: 1.4; color: var(--text, #3F3A34); }
.cs-name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.cs-option.active { background: #F3EFE6; }
.cs-option[aria-selected='true'] { background: #E8EDE4; font-weight: 600; }
.cs-check { flex: 0 0 auto; color: #5F7A58; font-weight: 700; }
.cs-muted { color: #9ca3af; font-weight: 400; font-size: 12px; }
.cs-create { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border, #E9E1D6); background: #fff; color: var(--primary-dark, #74896F); font-size: 14px; font-weight: 600; cursor: pointer; }
.cs-create.active { background: #F3EFE6; }
.transaction-modal .cs-button { padding: 11px 12px; border: 1px solid #DDDCD3; border-radius: 9px; background: #F8F8F4; color: #35332F; }
.transaction-modal .cs-button:disabled { background: #EFEDE6; }
.transaction-modal .cs-wrap.open .cs-button, .transaction-modal .cs-button:focus-visible { border-color: #91A68A; background: #FFFFFF; box-shadow: 0 0 0 3px rgba(145, 166, 138, 0.15); }
@media (max-width: 640px) { .cs-button { min-height: 44px; font-size: 16px; } .cs-option { padding: 11px 10px; font-size: 15px; } }
`;
export const categorySelectCss = css; // ให้ช่องกรอง (CategoryFilterSelect) ใช้หน้าตาเดียวกัน

// ช่องเลือกหมวดหมู่: แสดงเฉพาะหมวดของประเภทที่กำหนดและไม่ถูกซ่อน (เรียงให้ "อื่นๆ" อยู่ท้ายสุด)
//  - กดแล้วเปิดรายการแบบมีแถบเลื่อน ความสูงไม่เกินการ์ดที่เปิดอยู่ (ถ้าด้านล่างไม่พอจะเปิดขึ้นด้านบน) มีจุดสีของหมวด
//  - ท้ายรายการมีแถบ "+ สร้างหมวดใหม่…" ติดด้านล่างเสมอ (เมื่อรู้ประเภทและส่ง onCreated มา) สร้างเสร็จเลือกให้ทันที
//  - extra = หมวดเดิมของรายการ/งบที่กำลังแก้ไข ถ้าถูกซ่อนไปแล้วก็ยังแสดงให้เห็น (ติดป้าย "ซ่อนอยู่")
//  - มี <select> ของจริงซ่อนอยู่ด้านล่าง เพื่อให้ช่องบังคับ (required) แจ้งเตือนตามปกติและอ่านค่าได้เหมือนเดิม
//  - className / style ใช้กับกรอบนอก ส่วน props อื่น (id, aria-label, data-*) ส่งให้ <select> ที่ซ่อนอยู่
export default function CategorySelect({
  categories,
  type,
  value,
  onChange,
  onCreated,
  extra,
  placeholder = '-- เลือกหมวดหมู่ --',
  disabled,
  required,
  className,
  style,
  ...rest
}) {
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState({ up: false, max: MAX_PANEL });
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const items = useMemo(() => {
    const list = (categories || []).filter((c) => c.type === type && !c.hidden);
    const inList = (id) => list.some((c) => String(c.category_id) === String(id));
    const known = extra && (categories || []).find((c) => String(c.category_id) === String(extra.category_id));
    const showExtra = !!extra && !!extra.category_id && extra.type === type && !inList(extra.category_id);
    const rows = list.map((c) => ({ value: String(c.category_id), name: c.name, color: c.color, c }));
    if (showExtra) {
      const hiddenNow = known ? !!known.hidden : !!extra.hidden;
      rows.push({ value: String(extra.category_id), name: (known && known.name) || extra.name || 'หมวดเดิม', color: (known && known.color) || '#9ca3af', hiddenNote: hiddenNow, c: known || { is_default: 0, name: extra.name } });
    }
    // "อื่นๆ" ท้ายสุดก่อนปุ่มสร้างหมวด
    const isOthers = (r) => !!r.c && !!r.c.is_default && r.name === OTHERS_NAME;
    return [...rows.filter((r) => !isOthers(r)), ...rows.filter(isOthers)];
  }, [categories, type, extra]);

  const canCreate = !!type && typeof onCreated === 'function' && !disabled;
  const selected = items.find((r) => r.value === String(value));
  const entries = useMemo(() => (canCreate ? [...items, { value: NEW_VALUE, create: true }] : items), [items, canCreate]);

  const choose = useCallback((entryValue) => {
    setOpen(false);
    if (entryValue === NEW_VALUE) {
      setCreating(true);
      return;
    }
    onChange(String(entryValue));
    if (btnRef.current) btnRef.current.focus();
  }, [onChange]);

  // ตำแหน่งและความสูงของกล่องรายการ: ไม่ให้เกินขอบการ์ดที่เลื่อนได้ (ป๊อปอัป) ถ้าด้านล่างไม่พอและด้านบนมีที่มากกว่า เปิดขึ้นด้านบน
  const measure = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return { up: false, max: MAX_PANEL };
    const b = btn.getBoundingClientRect();
    let bound = btn.parentElement;
    while (bound && bound !== document.body) {
      const oy = window.getComputedStyle(bound).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') break;
      bound = bound.parentElement;
    }
    const br = bound && bound !== document.body ? bound.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const top = Math.max(br.top, 0);
    const bottom = Math.min(br.bottom, window.innerHeight || br.bottom);
    if (!(bottom - top > 0) || !(b.bottom > 0 || b.top > 0)) return { up: false, max: MAX_PANEL }; // ไม่มีข้อมูลเลย์เอาต์
    const below = bottom - b.bottom - 12;
    const above = b.top - top - 12;
    if (below >= Math.min(MAX_PANEL, MIN_LIST + FOOTER + 40) || below >= above) return { up: false, max: Math.max(MIN_LIST + FOOTER, Math.min(MAX_PANEL, below)) };
    return { up: true, max: Math.max(MIN_LIST + FOOTER, Math.min(MAX_PANEL, above)) };
  }, []);

  const openPanel = useCallback(() => {
    if (disabled) return;
    const idx = entries.findIndex((r) => r.value === String(value));
    setActive(idx >= 0 ? idx : 0);
    setPlace(measure());
    setOpen(true);
  }, [disabled, entries, value, measure]);

  // เปิดอยู่: ปิดเมื่อกด Esc (เฉพาะรายการนี้ ไม่ให้ป๊อปอัปข้างล่างปิดตาม) / คลิกหรือแตะนอกกล่อง / ปรับขนาดหน้าจอ
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      if (btnRef.current) btnRef.current.focus();
    };
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onResize = () => setPlace(measure());
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure]);

  // เลื่อนให้แถวที่เลือก/ไฮไลต์อยู่ในมุมมอง
  useLayoutEffect(() => {
    if (!open || !listRef.current || active < 0) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (disabled) return;
    const last = entries.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openPanel(); return; }
      setActive((i) => (e.key === 'ArrowDown' ? Math.min(last, i + 1) : Math.max(0, i - 1)));
    } else if (e.key === 'Home' && open) {
      e.preventDefault(); setActive(0);
    } else if (e.key === 'End' && open) {
      e.preventDefault(); setActive(last);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openPanel();
      else if (active >= 0 && entries[active]) choose(entries[active].value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  // ใช้กับ <select> ที่ซ่อนอยู่ (เช่น โปรแกรมกรอกอัตโนมัติ/การทดสอบ)
  const handleNativeChange = (e) => {
    if (e.target.value === NEW_VALUE) {
      setCreating(true);
      return;
    }
    onChange(e.target.value);
  };

  const listMax = Math.max(MIN_LIST, place.max - (canCreate ? FOOTER : 0));

  return (
    <div className={`cs-wrap${open ? ' open' : ''}${className ? ` ${className}` : ''}`} style={style} ref={wrapRef}>
      <style>{css}</style>
      <button
        type="button"
        ref={btnRef}
        className="cs-button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest['aria-label'] || undefined}
        aria-required={required ? 'true' : undefined}
        disabled={disabled}
        data-cs-button
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
      >
        <span className={`cs-value${selected ? '' : ' placeholder'}`}>
          {selected && <span className="cs-dot" style={{ background: selected.color }} />}
          <span>{selected ? selected.name : placeholder}</span>
        </span>
        <svg className="cs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className={`cs-panel${place.up ? ' up' : ''}`} data-cs-panel>
          <div className="cs-list" id={listId} role="listbox" ref={listRef} style={{ maxHeight: listMax }} data-cs-list>
            {items.length === 0 && <div className="cs-muted" style={{ padding: 10 }} data-cs-empty>ยังไม่มีหมวดหมู่ในประเภทนี้</div>}
            {items.map((r, i) => (
              <div
                key={r.value}
                role="option"
                aria-selected={r.value === String(value)}
                data-idx={i}
                data-cs-option
                className={`cs-option${active === i ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r.value)}
              >
                <span className="cs-dot" style={{ background: r.color }} />
                <span className="cs-name">{r.name}{r.hiddenNote ? <span className="cs-muted"> (ซ่อนอยู่)</span> : null}</span>
                {r.value === String(value) && <span className="cs-check" aria-hidden="true">✓</span>}
              </div>
            ))}
          </div>
          {canCreate && (
            <div
              role="option"
              aria-selected="false"
              data-idx={items.length}
              data-cs-create
              className={`cs-create${active === items.length ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(items.length)}
              onClick={() => choose(NEW_VALUE)}
            >
              <span aria-hidden="true">＋</span> สร้างหมวดใหม่…
            </div>
          )}
        </div>
      )}

      {/* select ของจริง (ซ่อนด้วยความโปร่งใส ไม่ใช่ display:none) เพื่อให้ช่องบังคับแจ้งเตือนได้ตรงตำแหน่งนี้ */}
      <select
        value={value}
        onChange={handleNativeChange}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="cs-native"
        onFocus={() => btnRef.current && btnRef.current.focus()}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {items.map((r) => (
          <option key={r.value} value={r.value}>{r.name}{r.hiddenNote ? ' (ซ่อนอยู่)' : ''}</option>
        ))}
        {canCreate && <option value={NEW_VALUE}>+ สร้างหมวดใหม่…</option>}
      </select>

      {creating && (
        <CategoryCreateModal
          type={type}
          onClose={() => setCreating(false)}
          onCreated={(cat) => {
            setCreating(false);
            onCreated(cat);
            onChange(String(cat.category_id));
          }}
        />
      )}
    </div>
  );
}
