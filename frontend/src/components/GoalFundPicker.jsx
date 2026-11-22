// "จ่ายจากเงินออม" (ไม่บังคับ) ในฟอร์มรายจ่าย: เลือกเป้าที่สำเร็จแล้วและยังมีเงินเหลือ
// ระบบดึงเงินจากเป้าได้ไม่เกินยอดที่เหลือ ส่วนเกินหักจากเงินคงเหลือตามปกติ / ส่วนที่ดึงจากเป้าไม่นับในงบและไม่ถูกเตือนยอดสูงผิดปกติ
// goals: [{ goal_id, name, remaining }] (ตอนแก้รายการ remaining รวมยอดเดิมของรายการนั้นแล้ว)
const css = `
.gf-box { margin: 4px 0 12px; padding: 12px; border: 1px dashed #CFE0DD; border-radius: 12px; background: #F7FBFA; }
.gf-box > label { display: flex !important; align-items: center; flex-direction: row !important; justify-content: flex-start; gap: 6px; margin: 0 0 6px !important; text-align: left; font-size: 13px; font-weight: 600; color: #3E7E7A; }
.gf-box > label svg { flex: 0 0 auto; }
.gf-box select { width: 100%; box-sizing: border-box; border-color: #CFE0DD; }
.gf-pv { margin: 8px 0 0; font-size: 13px; line-height: 1.7; color: #6b6358; }
.gf-pv b { color: #3E7E7A; }
.gf-pv .w { color: #B08900; }
`;

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export const IconGoalSm = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>
);

// เดาเป้าจากข้อความ (ใช้กับรายการที่ AI/กฎอ่านได้): ชื่อเป้าอยู่ในข้อความ (ตัดคำนำหน้าทั่วไปออกก่อน)
// หรือพูดถึงเงินออมและมีเป้าให้เลือกเพียงเป้าเดียว
const PREFIX = /^(ทริป|เที่ยว|ไปเที่ยว|ไป|ซื้อ|ค่า|เก็บเงิน|ออมเงิน|เงิน)/;
export function guessGoal(text, goals) {
  const s = String(text || '').replace(/\s+/g, '').toLowerCase();
  if (!s || !goals || !goals.length) return '';
  for (const g of goals) {
    const name = String(g.name || '').replace(/\s+/g, '').toLowerCase();
    const core = name.replace(PREFIX, '');
    if ((name.length >= 2 && s.includes(name)) || (core.length >= 2 && s.includes(core))) return g.goal_id;
  }
  if (/เงินออม|เงินเก็บ|จากเป้า/.test(s) && goals.length === 1) return goals[0].goal_id;
  return '';
}

export default function GoalFundPicker({ goals = [], value = '', onChange, amount }) {
  const sel = goals.find((g) => g.goal_id === value) || null;
  const amt = Number(amount) || 0;
  const use = sel ? Math.min(amt, sel.remaining) : 0;
  const over = sel ? Math.max(0, Math.round((amt - sel.remaining) * 100) / 100) : 0;
  return (
    <div className="gf-box" data-goal-fund>
      <style>{css}</style>
      <label htmlFor="gf-select"><IconGoalSm />จ่ายจากเงินออม (ไม่บังคับ)</label>
      <select id="gf-select" value={value} onChange={(e) => onChange(e.target.value)} data-goal-fund-select>
        <option value="">ไม่ใช้เงินออม</option>
        {goals.map((g) => <option key={g.goal_id} value={g.goal_id}>{g.name} (เหลือ {baht(g.remaining)})</option>)}
      </select>
      {sel && amt > 0 && (
        <p className="gf-pv" data-goal-fund-preview>
          ใช้เงินออม <b>{baht(use)}</b>{over > 0 ? ' (ที่เหลือทั้งหมด)' : ` · เหลือในเป้า ${baht(sel.remaining - use)}`}
          <br />
          {over > 0 ? <span className="w">อีก {baht(over)} หักจากเงินคงเหลือ</span> : 'เงินคงเหลือไม่ลดจากรายการนี้'}
        </p>
      )}
    </div>
  );
}
