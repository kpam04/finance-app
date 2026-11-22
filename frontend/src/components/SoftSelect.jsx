import { useEffect, useId, useRef, useState } from 'react';
import { categorySelectCss } from './CategorySelect.jsx';

// ช่องเลือกแบบเดียวกับช่องเลือกหมวดหมู่ (ปุ่ม + กล่องรายการ) ใช้กับตัวเลือกสั้น ๆ เช่น ประเภท / จ่ายจากเงินออม
//  options: [{ value, label, dot?: สีจุด, icon?: ไอคอน, sub?: ข้อความเล็กด้านขวา }]
//  - มี <select> ของจริงซ่อนอยู่ เพื่อให้ required แจ้งเตือนตามปกติ (invalidMessage = ข้อความแจ้งเตือน)
//  - ใช้คีย์บอร์ดได้ (ลูกศร Enter Esc) กดที่อื่นเพื่อปิด
const extraCss = `
.ss-sub { flex: 0 0 auto; margin-left: auto; font-size: 12px; color: #8A8177; font-weight: 400; }
.ss-icon { display: inline-flex; flex: 0 0 auto; width: 10px; justify-content: center; color: #3E7E7A; }
.ss-icon svg { width: 13px; height: 13px; }
`;

export default function SoftSelect({ options = [], value = '', onChange, placeholder = 'เลือก', disabled, required, invalidMessage, ariaLabel, ...rest }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const nativeRef = useRef(null);
  const listId = useId();
  const idx = options.findIndex((o) => String(o.value) === String(value));
  const sel = idx >= 0 ? options[idx] : null;
  const showPlaceholder = !sel || (sel.value === '' && !sel.label);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open]);

  const choose = (i) => {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    if (nativeRef.current) nativeRef.current.setCustomValidity('');
    if (String(o.value) !== String(value)) onChange(o.value);
  };
  const openList = () => { if (disabled) return; setActive(idx >= 0 ? idx : 0); setOpen(true); };
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openList();
      else setActive((a) => Math.min(options.length - 1, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openList(); else choose(active);
    } else if (e.key === 'Tab') setOpen(false);
  };
  const mark = (o) => (o.icon ? <span className="ss-icon">{o.icon}</span> : o.dot ? <span className="cs-dot" style={{ background: o.dot }} /> : null);

  return (
    <div className={`cs-wrap${open ? ' open' : ''}`} ref={wrapRef}>
      <style>{categorySelectCss}</style>
      <style>{extraCss}</style>
      <button type="button" className="cs-button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel} disabled={disabled} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}>
        <span className={`cs-value${showPlaceholder ? ' placeholder' : ''}`}>
          {!showPlaceholder && mark(sel)}
          {showPlaceholder ? placeholder : sel.label}
          {!showPlaceholder && sel.sub && <span className="cs-muted">{sel.sub}</span>}
        </span>
        <svg className="cs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <select
        ref={nativeRef}
        className="cs-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        required={required}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInvalid={(e) => { if (invalidMessage) e.target.setCustomValidity(invalidMessage); }}
        {...rest}
      >
        {!options.some((o) => o.value === '') && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
      {open && (
        <div className="cs-panel">
          <div className="cs-list" role="listbox" id={listId} aria-label={ariaLabel}>
            {options.map((o, i) => {
              const isSel = String(o.value) === String(value);
              return (
                <div key={String(o.value)} role="option" aria-selected={isSel} className={`cs-option${i === active ? ' active' : ''}`} data-ss-option={o.value} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
                  {mark(o) || <span className="cs-dot" style={{ background: 'transparent' }} />}
                  <span className="cs-name">{o.label}</span>
                  {o.sub && <span className="ss-sub">{o.sub}</span>}
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
