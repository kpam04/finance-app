import MonthPicker from './MonthPicker.jsx';

// ช่องเลือก "ดูเดือน" + ปี (พ.ศ.) หน้าตาเดียวกับหน้าวางแผน ใช้ในแดชบอร์ดและหน้างบประมาณ
//  years: ปี ค.ศ. ที่เลือกได้ (เรียงอย่างไรก็ได้ จะแสดงใหม่ → เก่า)
const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const css = `
.myp { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; color: #6b7280; }
.myp > span { white-space: nowrap; }
.myp .myp-m { width: 200px; }
.myp .myp-y { width: 96px; }
.myp .cs-wrap { width: 100%; }
@media (max-width: 560px) { .myp { display: flex; width: 100%; } .myp .myp-m { flex: 1; width: auto; min-width: 0; } }
`;

export default function MonthYearPicker({ month, year, years, onChange, label = 'ดูเดือน' }) {
  const now = new Date();
  const curY = now.getFullYear();
  const ys = [...new Set(years)].sort((a, b) => b - a);
  return (
    <div className="myp" data-myp>
      <style>{css}</style>
      <span>{label}</span>
      <div className="myp-m">
        <MonthPicker
          options={MONTH_TH.map((name, i) => ({ value: i + 1, label: name }))}
          value={month}
          currentValue={year === curY ? now.getMonth() + 1 : null}
          onChange={(m) => onChange(Number(m), year)}
          ariaLabel="เลือกเดือนที่ดู"
        />
      </div>
      <div className="myp-y">
        <MonthPicker
          options={ys.map((y) => ({ value: y, label: String(y + 543) }))}
          value={year}
          currentValue={null}
          onChange={(y) => onChange(month, Number(y))}
          ariaLabel="เลือกปีที่ดู (พ.ศ.)"
        />
      </div>
    </div>
  );
}
