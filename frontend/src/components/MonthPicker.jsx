import { useEffect, useRef, useState } from 'react';
import { categorySelectCss } from './CategorySelect.jsx';

// ช่องเลือกเดือน (หน้าตาเดียวกับช่องเลือกหมวดหมู่) รายการยาวเกินความสูงที่กำหนดจะมีแถบเลื่อนในกล่อง
//  options: [{ value, label }] เรียงจากใหม่ไปเก่า / currentValue = เดือนปัจจุบัน (ต่อท้าย "(เดือนนี้)")
//  คีย์บอร์ด: ลูกศร Home End Enter เว้นวรรค Esc Tab / กดนอกกล่องเพื่อปิด / ถ้าด้านล่างไม่พอจะเปิดขึ้นด้านบน
const MAX_PANEL = 300;
const MIN_PANEL = 160;

export default function MonthPicker({ options, value, currentValue, onChange, ariaLabel = 'เลือกเดือนที่ดู' }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [maxH, setMaxH] = useState(MAX_PANEL);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const selIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const text = (o) => `${o.label}${o.value === currentValue ? ' (เดือนนี้)' : ''}`;

  const openPanel = () => {
    const el = wrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const goUp = below < 280 && r.top > below;
      setUp(goUp);
      setMaxH(Math.max(MIN_PANEL, Math.min(MAX_PANEL, (goUp ? r.top : below) - 16)));
    }
    setActive(selIdx);
    setOpen(true);
  };
  const choose = (idx) => {
    const o = options[idx];
    if (!o) return;
    setOpen(false);
    if (o.value !== value) onChange(o.value);
  };

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

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-mp-active="1"]');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e) => {
    const last = options.length - 1;
    if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); setOpen(false); }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openPanel();
      else setActive((a) => Math.min(last, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(last);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openPanel();
      else choose(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const cur = options[selIdx];
  return (
    <div className={`cs-wrap mp-wrap${open ? ' open' : ''}`} ref={wrapRef} data-month-picker>
      <style>{categorySelectCss}</style>
      <style>{'.mp-wrap .cs-button { min-height: 40px; font-size: 14px; }'}</style>
      <button
        type="button"
        className="cs-button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `mp-opt-${active}` : undefined}
        data-plan-month
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
      >
        <span className="cs-value">{cur ? text(cur) : ''}</span>
        <span className="cs-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`cs-panel${up ? ' up' : ''}`} data-mp-panel style={{ maxHeight: `${maxH}px` }}>
          <div className="cs-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`mp-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={`cs-option${i === active ? ' active' : ''}`}
                data-mp-option={o.value}
                data-mp-active={i === active ? '1' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="cs-name">{o.label}{o.value === currentValue && <span className="cs-muted"> (เดือนนี้)</span>}</span>
                {o.value === value && <span className="cs-check" aria-hidden="true">✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
