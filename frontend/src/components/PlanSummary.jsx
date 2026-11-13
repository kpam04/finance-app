import { Link, useInRouterContext } from 'react-router-dom';
import { baht, num1, chipParts } from '../utils/planFormat.js';
import { AdviceIcon } from './PlanIcons.jsx';

// สรุปย่อการวางแผนบนแดชบอร์ด (เดือนปัจจุบันเท่านั้น ไม่เรียก AI): คาดการณ์สิ้นเดือน 1-2 ข้อสำคัญ เป้าหมายการออมแรก และลิงก์ไปหน้า "วางแผน"
const css = `
.ps-wrap { margin: 0 0 14px; padding-bottom: 12px; border-bottom: 1px solid #f0ebe0; font-size: 14px; }
.ps-proj { margin-bottom: 8px; line-height: 1.6; }
.ps-proj .bad { color: #b45309; }
.ps-proj small { color: #6b7280; font-size: 12px; }
.ps-item { display: flex; gap: 8px; padding: 6px 0; line-height: 1.6; }
.ps-item .adv-ic { flex: 0 0 20px; display: inline-flex; padding-top: 3px; }
.adv-warning { color: #d97706; } .adv-goal { color: #16a34a; } .adv-tip { color: #6b7280; }
.ps-tag { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: #E8EDE4; color: #40563C; font-size: 11px; font-weight: 600; }
.ps-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.ps-chip { padding: 1px 8px; border-radius: 999px; background: #EEF2F8; color: #3b5b8f; font-size: 11px; overflow-wrap: anywhere; }
.ps-goal { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #F8F6F0; font-size: 13px; }
.ps-bar { height: 6px; margin: 6px 0 4px; border-radius: 3px; background: #EEE9DD; overflow: hidden; }
.ps-bar i { display: block; height: 100%; background: #7E9677; }
/* ปุ่มอยู่ขวาล่าง ใต้บรรทัดข้อความ */
.ps-item-act { flex-wrap: wrap; }
.ps-item-act .ps-tx { flex: 1 1 calc(100% - 28px); min-width: 0; }
.ps-act { display: inline-block; flex: none; margin: 2px 0 0 auto; white-space: nowrap; padding: 3px 12px; border: 1px solid #7E9677; border-radius: 999px; background: #7E9677; font-size: 12px; font-weight: 600; color: #fff; text-decoration: none; }
.ps-act:hover { background: #6B8364; border-color: #6B8364; }
.ps-link { display: inline-block; margin-top: 8px; font-size: 13px; color: #40563C; text-decoration: underline; }
`;
const GOAL_STATUS = { reached: 'ออมครบแล้ว', on_track: 'ทันตามกำหนด', behind: 'ยังไม่ทันตามกำหนด', no_surplus: 'ยังออมไม่ได้', overdue: 'เลยกำหนดแล้ว', unknown: 'ยังประเมินไม่ได้' };

// ในแอพใช้ Link ของ React Router (ไม่โหลดหน้าใหม่) ถ้าไม่ได้อยู่ใน Router ใช้ลิงก์ธรรมดา
function SafeLink({ to, children, ...rest }) {
  const inRouter = useInRouterContext();
  return inRouter ? <Link to={to} {...rest}>{children}</Link> : <a href={to} {...rest}>{children}</a>;
}

export default function PlanSummary({ summary }) {
  if (!summary || !summary.has_data) return null;
  const items = [];
  if (summary.ai_advice_first) items.push({ ...summary.ai_advice_first, source: 'ai' });
  // เติมจากระบบจนครบ 2 ข้อ โดยข้ามข้อที่ใช้ตัวเลขชุดเดียวกับของ AI (พูดเรื่องเดียวกัน) เพื่อไม่ให้การ์ดซ้ำซ้อน
  const used = new Set((items[0] && items[0].facts_used ? items[0].facts_used : []).map((f) => f.id));
  const overlaps = (r) => (r.facts_used || []).some((f) => used.has(f.id));
  const pool = summary.rules_advice || [];
  for (const r of [...pool.filter((x) => !overlaps(x)), ...pool.filter((x) => overlaps(x))]) if (items.length < 2) items.push({ ...r, source: 'rules' });
  const p = summary.projection || {};
  const g = summary.goal;
  return (
    <div className="ps-wrap" data-plan-summary>
      <style>{css}</style>
      {p.expense_end !== null && p.expense_end !== undefined && (
        <div className="ps-proj" data-ps-proj>
          คาดการณ์รายจ่ายสิ้นเดือน <b>{baht(p.expense_end)}</b>{' '}
          <small className={p.over_income ? 'bad' : ''}>{p.income_ref ? `เทียบรายรับอ้างอิง ${baht(p.income_ref)} (${num1(p.pct_of_income)}%)` : 'ยังไม่มีรายรับให้เทียบ'}</small>
        </div>
      )}
      {items.map((it, i) => (
        <div className="ps-item" key={i} data-ps-item>
          <AdviceIcon tag={it.tag} size={16} />
          <div>
            <div>{it.text}{it.source === 'ai' && <span className="ps-tag">AI</span>}</div>
            {it.source === 'ai' && it.facts_used && it.facts_used.length > 0 && (
              <div className="ps-chips">{it.facts_used.map((f) => { const [short, value] = chipParts(f); return <span className="ps-chip" key={f.id} title={f.label}>{short ? `${short} ` : ''}<b>{value}</b></span>; })}</div>
            )}
          </div>
        </div>
      ))}
      {summary.rec_suggest && (
        <div className="ps-item ps-item-act" data-ps-recsug>
          <AdviceIcon tag={summary.rec_suggest.tag} size={16} />
          <div className="ps-tx">{summary.rec_suggest.text}</div>
          <SafeLink to="/recurring" className="ps-act">ดูรายการที่ควรตั้ง</SafeLink>
        </div>
      )}
      {g ? (
        <div className="ps-goal" data-ps-goal>
          <div><b>{g.name}</b> · {baht(g.saved_amount)} / {baht(g.target_amount)} ({num1(g.progress_pct)}%)</div>
          <div className="ps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.progress_pct} aria-label={`ความคืบหน้า ${g.name}`}><i style={{ width: `${g.progress_pct}%` }} /></div>
          <div>{GOAL_STATUS[g.status] || ''}{g.status === 'behind' && g.required_monthly ? ` (ต้องออมเดือนละ ${baht(g.required_monthly)})` : ''}</div>
        </div>
      ) : (
        <SafeLink to="/plan?tab=goals" className="ps-link" data-ps-setgoal>ตั้งเป้าหมายการออม →</SafeLink>
      )}
    </div>
  );
}
