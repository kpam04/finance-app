import { CATEGORY_COLORS } from '../utils/categoryColors.js';

// จานสี 10 สี (เลือกได้ทีละสี) ใช้ในป๊อปอัปสร้างหมวดและตอนแก้ไขหมวด
export default function ColorPalette({ value, onChange, disabled }) {
  const known = CATEGORY_COLORS.some((c) => c.value.toLowerCase() === String(value || '').toLowerCase());
  return (
    <div role="radiogroup" aria-label="เลือกสีของหมวดหมู่" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {CATEGORY_COLORS.map((c) => {
        const selected = c.value.toLowerCase() === String(value || '').toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`สี${c.name}`}
            title={c.name}
            data-color={c.value}
            disabled={disabled}
            onClick={() => onChange(c.value)}
            style={{
              width: 30, height: 30, padding: 0, borderRadius: '50%', background: c.value, cursor: disabled ? 'not-allowed' : 'pointer',
              border: selected ? '3px solid #374151' : '3px solid transparent',
              boxShadow: selected ? '0 0 0 2px #fff inset' : 'none',
            }}
          />
        );
      })}
      {!known && value ? (
        <span title="สีเดิมของหมวดนี้ (เลือกสีจากจานสีเพื่อเปลี่ยน)" style={{ width: 30, height: 30, borderRadius: '50%', background: value, border: '3px solid #374151', boxShadow: '0 0 0 2px #fff inset', display: 'inline-block' }} />
      ) : null}
    </div>
  );
}
