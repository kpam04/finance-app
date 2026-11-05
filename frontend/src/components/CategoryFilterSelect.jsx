import { useEffect, useMemo, useRef, useState } from 'react';
import { categorySelectCss, orderForPicker } from './CategorySelect.jsx';

// ช่องเลือกหมวดหมู่สำหรับ "ตัวกรอง" (หน้าตาเดียวกับช่องเลือกหมวดตอนเพิ่มรายการ แต่ไม่มีแถบสร้างหมวดใหม่)
//  - type = 'expense' | 'income': แสดงเฉพาะหมวดของประเภทนั้น / type = '' (ทั้งหมด): แสดงสองกลุ่มมีหัวข้อ "รายจ่าย" "รายรับ"
//  - แถวแรกคือ "ทุกหมวดหมู่" (ล้างตัวเลือก) หมวดที่ถูกซ่อนยังเลือกได้ท้ายกลุ่มพร้อมป้าย "(ซ่อนอยู่)" เพราะรายการเก่าอาจใช้หมวดนั้น
//  - ใช้คีย์บอร์ดได้ (ลูกศร Home End Enter Esc) กดนอกกล่องหรือแตะที่อื่นเพื่อปิด ถ้าด้านล่างไม่พอจะเปิดขึ้นด้านบน
const TYPE_LABEL = { expense: 'รายจ่าย', income: 'รายรับ' };
const ALL_LABEL = 'ทุกหมวดหมู่';
const MAX_PANEL = 300; // ความสูงสูงสุดของกล่องรายการ (พิกเซล) ถ้ามีหมวดมากกว่านี้จะมีแถบเลื่อน
const MIN_PANEL = 180;

const extraCss = `
.cf-wrap .cs-button { min-height: 42px; font-size: 14px; }
.cs-group { padding: 8px 10px 4px; font-size: 12px; font-weight: 600; color: #8A8177; }
.cs-list > .cs-group:first-child { padding-top: 4px; }
`;

export default function CategoryFilterSelect({ categories = [], type = '', value = '', onChange, ariaLabel = 'กรองตามหมวดหมู่' }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [maxH, setMaxH] = useState(MAX_PANEL);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  // แถวทั้งหมดของรายการ: ตัวเลือก "ทุกหมวดหมู่" + (หัวข้อกลุ่ม) + หมวดต่าง ๆ (หมวดที่ซ่อนอยู่ท้ายกลุ่ม)
  const rows = useMemo(() => {
    const out = [{ kind: 'option', value: '', name: ALL_LABEL, all: true }];
    const groups = type ? [type] : ['expense', 'income'];
    for (const g of groups) {
      const list = categories.filter((c) => c.type === g);
      if (list.length === 0) continue;
      if (!type) out.push({ kind: 'group', name: TYPE_LABEL[g], key: `g-${g}` });
      const visible = orderForPicker(list.filter((c) => !c.hidden));
      const hidden = list.filter((c) => c.hidden);
      for (const c of [...visible, ...hidden]) out.push({ kind: 'option', value: String(c.category_id), name: c.name, color: c.color, hidden: !!c.hidden });
    }
    return out;
  }, [categories, type]);

  const optionIdx = useMemo(() => rows.map((r, i) => (r.kind === 'option' ? i : -1)).filter((i) => i >= 0), [rows]);
  const current = String(value || '');
  const selectedIdx = rows.findIndex((r) => r.kind === 'option' && r.value === current);
  const selected = selectedIdx >= 0 ? rows[selectedIdx] : rows[0];

  const openPanel = () => {
    const el = wrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const goUp = below < 280 && r.top > below;
      setUp(goUp);
      // ความสูงกล่อง = ที่ว่างด้านที่เปิด (เว้นขอบ 16px) ไม่เกิน 300 ไม่ต่ำกว่า 180 เกินแล้วเลื่อนในกล่อง
      setMaxH(Math.max(MIN_PANEL, Math.min(MAX_PANEL, (goUp ? r.top : below) - 16)));
    }
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };
  const choose = (idx) => {
    const r = rows[idx];
    if (!r || r.kind !== 'option') return;
    setOpen(false);
    if (r.value !== current) onChange(r.value);
  };
  const move = (delta) => {
    const pos = optionIdx.indexOf(active);
    const next = optionIdx[Math.min(optionIdx.length - 1, Math.max(0, (pos < 0 ? 0 : pos) + delta))];
    setActive(next);
  };

  // กดที่อื่นเพื่อปิด
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

  // เลื่อนให้เห็นแถวที่เลือกอยู่
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-cf-active="1"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openPanel();
      else move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(optionIdx[0]);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(optionIdx[optionIdx.length - 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openPanel();
      else choose(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const label = selected.all ? ALL_LABEL : `${selected.name}${selected.hidden ? ' (ซ่อนอยู่)' : ''}`;
  return (
    <div className={`cs-wrap cf-wrap${open ? ' open' : ''}`} ref={wrapRef} data-cat-filter-wrap>
      <style>{categorySelectCss}</style>
      <style>{extraCss}</style>
      <button
        type="button"
        className="cs-button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `cf-opt-${active}` : undefined}
        data-cat-filter
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
      >
        <span className={`cs-value${selected.all ? ' placeholder' : ''}`}>
          {!selected.all && <span className="cs-dot" style={{ background: selected.color || '#9ca3af' }} />}
          {label}
        </span>
        <span className="cs-chevron" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={`cs-panel${up ? ' up' : ''}`} data-cf-panel style={{ maxHeight: `${maxH}px` }}>
          <div className="cs-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
            {rows.map((r, i) => {
              if (r.kind === 'group') {
                return <div key={r.key} className="cs-group" role="presentation" data-cf-group>{r.name}</div>;
              }
              const isSel = r.value === current;
              return (
                <div
                  key={`o-${r.value || 'all'}`}
                  id={`cf-opt-${i}`}
                  role="option"
                  aria-selected={isSel}
                  className={`cs-option${i === active ? ' active' : ''}`}
                  data-cf-option={r.value}
                  data-cf-active={i === active ? '1' : undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  {r.all ? <span className="cs-dot" style={{ background: 'transparent' }} /> : <span className="cs-dot" style={{ background: r.color || '#9ca3af' }} />}
                  <span className="cs-name">{r.name}{r.hidden && <span className="cs-muted"> (ซ่อนอยู่)</span>}</span>
                  {isSel && <span className="cs-check" aria-hidden="true">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
