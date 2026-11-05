import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import InfoTitle from '../components/InfoTitle.jsx';
import GoalModal from '../components/GoalModal.jsx';
import MonthPicker from '../components/MonthPicker.jsx';
import AiConsentModal from '../components/AiConsentModal.jsx';
import { IconSpark, IconFlag, IconChart, IconEdit, IconTrash, IconThumb, AdviceIcon } from '../components/PlanIcons.jsx';
import { baht, num1, thaiDate, thaiMonth, thaiMonthYearShort, chipParts, monthOptions } from '../utils/planFormat.js';

// หน้า "วางแผน": วิเคราะห์พฤติกรรมการใช้จ่าย + คำแนะนำ (จากระบบ / จาก AI) + เป้าหมายการออม + ลองปรับแผน
// ตัวเลขทั้งหมดคำนวณโดยระบบ AI เขียนเฉพาะคำอธิบายและต้องผ่านการตรวจตัวเลขก่อนแสดง
const css = `
.pl-page { max-width: 1100px; margin: 0 auto; }
.pl-head { margin-bottom: 14px; }
.pl-head h2 { margin: 0; }
.pl-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; }
.pl-month { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; color: #6b7280; }
.pl-month > span { white-space: nowrap; }
.pl-month .cs-wrap { width: 220px; }
@media (max-width: 560px) { .pl-month { display: flex; width: 100%; } .pl-month .cs-wrap { flex: 1; width: auto; min-width: 0; } }
.pl-past .pl-link { font-weight: 600; color: #3b5b8f; text-decoration: underline; }
.pl-past { display: flex; align-items: center; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #EEF2F8; color: #3b5b8f; font-size: 13px; line-height: 1.6; }
.pl-stale { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: #FDF0DC; color: #92400e; font-size: 13px; line-height: 1.6; }
.pl-limits { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; line-height: 1.6; }
.pl-limits p { margin: 0; }
.pl-limits p + p { margin-top: 4px; }
.pl-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 12px; }
.pl-metric { padding: 10px 12px; border-radius: 10px; background: #F8F6F0; min-width: 0; }
.pl-metric .l { font-size: 12px; color: #6b7280; }
.pl-metric .v { margin: 2px 0; font-size: 20px; font-weight: 600; color: #3F3A34; word-break: break-word; }
.pl-metric .s { font-size: 12px; color: #6b7280; line-height: 1.5; }
.pl-metric .s.bad { color: #b45309; }
.pl-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; align-items: end; height: 96px; margin-top: 14px; }
.pl-day { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 11px; color: #6b7280; }
.pl-day i { display: block; width: 100%; max-width: 28px; min-height: 2px; border-radius: 4px 4px 0 0; background: #B9C8B2; }
.pl-day.peak i { background: #7E9677; }
.pl-days-cap { margin: 6px 0 0; font-size: 12px; color: #8A8177; }
.pl-details { margin-top: 12px; font-size: 13px; }
.pl-details summary { cursor: pointer; color: #4b5563; }
.pl-table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px; }
.pl-table th, .pl-table td { padding: 6px 4px; text-align: right; border-bottom: 1px solid #f0ebe0; }
.pl-table th:first-child, .pl-table td:first-child { text-align: left; }
.pl-table .flag { color: #b45309; font-weight: 600; }
.pl-ti { display: inline-flex; vertical-align: -3px; margin-right: 6px; color: #6b7280; }
.pl-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.pl-grid > .card, .pl-page > .card { margin-bottom: 0; }
.pl-page > .card { margin-bottom: 14px; }
@media (min-width: 960px) { .pl-grid { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); } }
.pl-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid #f0ebe0; }
.pl-link { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border: none; background: none; font: inherit; font-size: 13px; color: #4b5563; cursor: pointer; }
.pl-link:hover:not(:disabled) { color: #40563C; text-decoration: underline; }
.pl-link:disabled { color: #b0a99c; cursor: not-allowed; }
.pl-busy { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: #4b5563; }
.pl-item { display: flex; gap: 10px; padding: 12px 0; border-top: 1px solid #f3efe6; }
.pl-item:first-of-type { border-top: none; }
.adv-ic { flex: 0 0 22px; display: inline-flex; align-items: flex-start; padding-top: 2px; }
.adv-warning { color: #d97706; } .adv-goal { color: #16a34a; } .adv-tip { color: #6b7280; }
.pl-item .tx { min-width: 0; flex: 1; font-size: 14px; line-height: 1.6; }
.pl-badge { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: #F3EFE6; color: #6b7280; font-size: 11px; font-weight: 600; vertical-align: 1px; }
.pl-badge.ai { background: #E8EDE4; color: #40563C; }
.pl-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 6px; }
.pl-chip { display: inline-block; max-width: 100%; padding: 2px 9px; border-radius: 999px; background: #EEF2F8; color: #3b5b8f; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.pl-chip b { font-weight: 600; }
.pl-rate { display: inline-flex; gap: 2px; margin-left: auto; }
.pl-rate button { display: inline-flex; padding: 3px 6px; border: 1px solid transparent; border-radius: 999px; background: none; color: #9a9185; cursor: pointer; }
.pl-rate button:hover { color: #4b5563; }
.pl-rate button[aria-pressed='true'] { background: #E8EDE4; border-color: #9AAB91; color: #40563C; }
.pl-note { margin: 8px 0 0; font-size: 12px; color: #8A8177; line-height: 1.6; }
.pl-msg { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.pl-foot { margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0ebe0; }
.pl-foot .pl-note { margin: 0; }
.pl-foot .pl-note + .pl-note { margin-top: 4px; }
.pl-goal { padding: 12px 0; border-top: 1px solid #f0ebe0; }
.pl-goal:first-of-type { border-top: none; }
.pl-goal-top { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
.pl-goal-name { font-weight: 600; }
.pl-goal-meta { margin-left: auto; font-size: 12px; color: #6b7280; }
.pl-goal-tools { display: inline-flex; gap: 2px; }
.pl-goal-tools button { display: inline-flex; padding: 3px 5px; border: none; border-radius: 6px; background: none; color: #9a9185; cursor: pointer; }
.pl-goal-tools button:hover { color: #4b5563; background: #F3EFE6; }
.pl-bar { height: 8px; margin: 8px 0 6px; border-radius: 4px; background: #EEE9DD; overflow: hidden; }
.pl-bar i { display: block; height: 100%; background: #7E9677; }
.pl-bar.warn i { background: #d97706; }
.pl-goal-sum { font-size: 13px; line-height: 1.7; color: #4b5563; }
.pl-status { display: inline-block; margin-left: 4px; padding: 0 8px; border-radius: 999px; background: #F3EFE6; color: #6b7280; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pl-status.ok { background: #E4F2E6; color: #166534; }
.pl-status.warn { background: #FDF0DC; color: #92400e; }
.pl-goal-more { margin-top: 4px; font-size: 12.5px; color: #6b7280; }
.pl-goal-more summary { cursor: pointer; }
.pl-goal-more p { margin: 4px 0 0; line-height: 1.6; }
.pl-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 13px; }
.pl-empty { margin: 8px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
`;

const DAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// สถานะของเป้าหมายเป็นข้อความอ่านง่าย
function goalLine(g) {
  switch (g.status) {
    case 'reached': return { cls: 'ok', text: 'ออมครบตามเป้าหมายแล้ว' };
    case 'on_track': return { cls: 'ok', text: `ทันตามกำหนด: ต้องออมเดือนละ ${baht(g.required_monthly)} เงินเหลือเฉลี่ยต่อเดือน ${baht(g.capacity_monthly)} ถ้าแบ่งมาออมทั้งหมด คาดว่าจะถึงเป้าหมายราว ${thaiDate(g.eta_date)}` };
    case 'behind': return { cls: 'warn', text: `ยังไม่ทันตามกำหนด: ต้องออมเดือนละ ${baht(g.required_monthly)} แต่เงินเหลือเฉลี่ยต่อเดือน ${baht(g.capacity_monthly)} (ขาดเดือนละ ${baht(g.shortfall_monthly)}) ถ้าแบ่งมาออมทั้งหมด คาดว่าจะถึงเป้าหมายราว ${thaiDate(g.eta_date)} ช้ากว่ากำหนดราว ${num1(g.delay_months)} เดือน` };
    case 'no_surplus': return { cls: 'warn', text: `ยังออมไม่ได้: ช่วงที่ผ่านมารายจ่ายไม่ต่ำกว่ารายรับ (ต้องออมเดือนละ ${baht(g.required_monthly)} จึงจะทัน)` };
    case 'overdue': return { cls: 'warn', text: `เลยกำหนดแล้ว ยังขาดอีก ${baht(g.remaining)}${g.eta_date ? ` ถ้าออมในอัตราปัจจุบันจะถึงราว ${thaiDate(g.eta_date)}` : ''}` };
    default: return { cls: '', text: `ยังประเมินไม่ได้ เพราะต้องมีประวัติอย่างน้อย 1 เดือนเต็ม (ต้องออมเดือนละ ${baht(g.required_monthly)} จึงจะทัน)` };
  }
}

// บรรทัดสรุปสั้นของเป้าหมาย + ป้ายสถานะ (รายละเอียดยาวอยู่ในส่วน "รายละเอียด")
function goalSummary(g) {
  let t = `ออมแล้ว ${baht(g.saved_amount)} (${num1(g.progress_pct)}%)`;
  if (g.status !== 'reached') {
    if (g.required_monthly !== null && g.required_monthly !== undefined) t += ` · ต้องออมเดือนละ ${baht(g.required_monthly)}`;
    if (g.capacity_monthly !== null && g.capacity_monthly !== undefined) t += ` · เงินเหลือเฉลี่ยเดือนละ ${baht(g.capacity_monthly)}`;
  }
  return t;
}
function goalStatus(g) {
  switch (g.status) {
    case 'reached': return { cls: 'ok', text: 'ครบแล้ว' };
    case 'on_track': return { cls: 'ok', text: 'ทันตามกำหนด' };
    case 'behind': return { cls: 'warn', text: `ไม่ทัน ขาดเดือนละ ${baht(g.shortfall_monthly)}` };
    case 'no_surplus': return { cls: 'warn', text: 'ยังออมไม่ได้' };
    case 'overdue': return { cls: 'warn', text: `เลยกำหนด ขาดอีก ${baht(g.remaining)}` };
    default: return { cls: '', text: 'ประเมินไม่ได้' };
  }
}

// ป้ายตัวเลขใต้คำแนะนำ (ชื่อสั้น + ค่า) ชี้ที่ป้ายเพื่อดูคำอธิบายเต็ม
function Chips({ facts }) {
  if (!facts || facts.length === 0) return null;
  return facts.map((f) => {
    const [short, value] = chipParts(f);
    return <span className="pl-chip" key={f.id} title={f.label}>{short ? `${short} ` : ''}<b>{value}</b></span>;
  });
}

export default function Plan() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiMsg, setAiMsg] = useState('');
  const [aiDropped, setAiDropped] = useState(0);
  const [showConsent, setShowConsent] = useState(false);
  const [goalModal, setGoalModal] = useState(null); // null | { goal } (goal = null เพิ่มใหม่)
  const [confirmDel, setConfirmDel] = useState(null);
  const [curMonth, setCurMonth] = useState(null); // เดือนปัจจุบันตามเวลาไทย (หลังบ้านบอก) ใช้สร้างตัวเลือกเดือน
  const abortRef = useRef(null);
  const alive = useRef(true);
  const reqId = useRef(0); // ลำดับคำขอ: ถ้าเปลี่ยนเดือนเร็ว ๆ ผลของคำขอเก่าที่มาช้าจะถูกทิ้ง
  const selRef = useRef(null); // เดือนที่เลือกดู (null = เดือนปัจจุบัน)

  const load = useCallback(async () => {
    const id = reqId.current + 1;
    reqId.current = id;
    setError('');
    try {
      const res = await api.getPlanOverview(selRef.current || undefined);
      if (alive.current && id === reqId.current) {
        setData(res.data);
        setCurMonth(res.data.current_month);
      }
    } catch (e) {
      if (alive.current && id === reqId.current) setError(e.message || 'โหลดข้อมูลการวางแผนไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!aiBusy) return undefined;
    const t = setInterval(() => setAiElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [aiBusy]);

  const runAdvice = async () => {
    setAiMsg('');
    setAiDropped(0);
    setAiElapsed(0);
    setAiBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await api.planAdvice(ctrl.signal);
      if (ctrl.signal.aborted || !alive.current) return;
      setAiDropped(res.data.dropped || 0);
      setData((d) => ({ ...d, ai_advice: { items: res.data.items, generated_at: res.data.generated_at, model: res.data.model, stale: false }, ai: { ...d.ai, plans_used_today: d.ai.plans_used_today + 1 } }));
    } catch (e) {
      if (ctrl.signal.aborted || !alive.current || (e && e.name === 'AbortError')) return;
      if (e.code === 'AI_PLAN_CONSENT_REQUIRED') setData((d) => ({ ...d, ai: { ...d.ai, plan_enabled: false } }));
      setAiMsg(e.message || 'ขอคำแนะนำจาก AI ไม่สำเร็จ');
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (alive.current && !ctrl.signal.aborted) setAiBusy(false);
    }
  };
  const cancelAdvice = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setAiBusy(false);
  };
  // เปลี่ยนเดือนที่ดู: ยกเลิกคำขอ AI ที่ค้างอยู่ (เป็นของเดือนปัจจุบัน) แล้วโหลดเดือนที่เลือก
  const pickMonth = (m) => {
    if (abortRef.current) cancelAdvice();
    selRef.current = m === curMonth ? null : m;
    setData(null);
    setAiMsg('');
    setAiDropped(0);
    setConfirmDel(null);
    setGoalModal(null);
    setShowConsent(false);
    load();
  };
  const askAi = () => {
    if (!data.ai.plan_enabled) setShowConsent(true);
    else runAdvice();
  };

  const rate = async (index, value) => {
    const cur = data.ai_advice.items[index].rating || 0;
    const next = cur === value ? 0 : value;
    setData((d) => ({ ...d, ai_advice: { ...d.ai_advice, items: d.ai_advice.items.map((it, i) => (i === index ? { ...it, rating: next } : it)) } }));
    try {
      await api.planAdviceFeedback({ month: data.month, index, rating: next });
    } catch {
      setData((d) => ({ ...d, ai_advice: { ...d.ai_advice, items: d.ai_advice.items.map((it, i) => (i === index ? { ...it, rating: cur } : it)) } }));
    }
  };
  const dropAdvice = async () => {
    try {
      await api.deletePlanAdvice(data.month);
      setData((d) => ({ ...d, ai_advice: null }));
      setAiMsg('');
    } catch (e) {
      setAiMsg(e.message || 'ลบไม่สำเร็จ');
    }
  };
  const delGoal = async (id) => {
    try {
      await api.deleteGoal(id);
      setConfirmDel(null);
      await load();
    } catch (e) {
      setError(e.message || 'ลบเป้าหมายไม่สำเร็จ');
    }
  };

  const monthPicker = curMonth ? (
    <div className="pl-month">
      <span>ดูเดือน</span>
      <MonthPicker options={monthOptions(curMonth, 24)} value={selRef.current || curMonth} currentValue={curMonth} onChange={pickMonth} />
    </div>
  ) : null;

  // หัวหน้าเดียวกันทุกสถานะ (กำลังโหลด / ผิดพลาด / ปกติ) ตำแหน่งเดิม ช่องเลือกเดือนจึงไม่ถูกสร้างใหม่ ถ้าผู้ใช้เปิดกล่องเลือกเดือนค้างไว้ระหว่างรอ กล่องจะไม่ปิดเองตอนข้อมูลโหลดเสร็จ
  const headRow = (
    <div className="pl-head">
      <div className="pl-head-row">
        {data ? (
          <InfoTitle as="h2" title="วางแผนการเงิน" label="คำอธิบายหน้านี้" popId="pl-info-head">
            <p>วิเคราะห์จากรายการของคุณใน{thaiMonth(data.month)}{data.is_current === false ? ' (เดือนที่ผ่านมา)' : ''} ตัวเลขทั้งหมดคำนวณโดยระบบ (ไม่ได้ให้ AI คิดเลข)</p>
          </InfoTitle>
        ) : <h2>วางแผนการเงิน</h2>}
        {monthPicker}
      </div>
    </div>
  );

  if (error && !data) {
    return (
      <div className="pl-page" data-plan-error>
        <style>{css}</style>
        {headRow}
        <div className="card"><p>{error}</p><button type="button" className="btn" onClick={load}>ลองใหม่</button></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pl-page" data-plan-loading>
        <style>{css}</style>
        {headRow}
        <p>กำลังโหลดการวิเคราะห์...</p>
      </div>
    );
  }

  const an = data.analysis;
  const ai = data.ai;
  const saved = data.ai_advice;
  const top = an.anomalies[0];
  const pctBase = an.daily.pct_vs_base;
  const peakDay = an.weekday.by_day.reduce((a, d) => (d.amount > a.amount ? d : a), an.weekday.by_day[0]);
  const maxDay = Math.max(1, ...an.weekday.by_day.map((d) => d.amount));
  const proj = an.projection;
  const catRows = an.categories.slice(0, 8);
  const isCur = data.is_current !== false; // false = กำลังดูเดือนที่ผ่านมา (ดูอย่างเดียว)

  // รายการคำแนะนำรวม: ของ AI ก่อน แล้วตามด้วยของระบบ (ข้ามข้อของระบบที่ใช้ตัวเลขชุดเดียวกับของ AI เพราะพูดเรื่องเดียวกัน)
  const aiItems = saved ? saved.items : [];
  const aiFactIds = new Set(aiItems.flatMap((it) => (it.facts_used || []).map((f) => f.id)));
  const sysItems = data.rules_advice.filter((it) => !(it.facts_used || []).some((f) => aiFactIds.has(f.id)));

  return (
    <div className="pl-page" data-plan-page>
      <style>{css}</style>
      {headRow}

      {!isCur && (
        <div className="pl-past" data-plan-past>
          <span>กำลังดูย้อนหลัง การวิเคราะห์และคำแนะนำดูได้อย่างเดียว ขอ AI วิเคราะห์ได้เฉพาะเดือนปัจจุบัน (เป้าหมายการออมไม่ขึ้นกับเดือนที่ดู)</span>
          <button type="button" className="pl-link" data-plan-back-current onClick={() => pickMonth(curMonth)}>กลับไปเดือนนี้</button>
        </div>
      )}

      {an.limits.length > 0 && (
        <div className="pl-limits" data-plan-limits>
          {an.limits.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}

      {/* ===== 1 พฤติกรรมการใช้จ่าย ===== */}
      <div className="card" data-plan-behavior>
        <InfoTitle title={<><span className="pl-ti"><IconChart size={18} /></span>{isCur ? 'พฤติกรรมการใช้จ่ายเดือนนี้' : `พฤติกรรมการใช้จ่าย ${thaiMonth(data.month)}`}</>} label="คำอธิบายส่วนนี้" popId="pl-info-behavior">
          <p>เทียบกับค่าเฉลี่ยของเดือนเต็มก่อนหน้า (สูงสุด 3 เดือน เฉพาะเดือนที่มีรายการ) หมวดที่ถือว่าสูงผิดปกติคือสูงกว่าที่ควรเป็นตั้งแต่ 30% และเกินอย่างน้อย 200 บาท หมวดที่จ่ายเป็นก้อน เช่น ค่าเช่า เทียบกับยอดเต็มเดือน</p>
        </InfoTitle>
        <div className="pl-metrics">
          <div className="pl-metric" data-m="daily">
            <div className="l">ใช้จ่ายเฉลี่ยต่อวัน</div>
            <div className="v">{an.daily.avg === null ? '-' : baht(an.daily.avg)}</div>
            <div className={`s${pctBase !== null && pctBase > 0 ? ' bad' : ''}`}>{pctBase === null ? 'ยังไม่มีค่าเฉลี่ยให้เทียบ' : `${pctBase > 0 ? 'สูงกว่า' : pctBase < 0 ? 'ต่ำกว่า' : 'เท่ากับ'}ค่าเฉลี่ยเดิม${pctBase === 0 ? '' : ` ${num1(Math.abs(pctBase))}%`}`}</div>
          </div>
          <div className="pl-metric" data-m="peak">
            <div className="l">วันที่ใช้จ่ายสูงสุดของสัปดาห์</div>
            <div className="v">{an.weekday.peak ? an.weekday.peak.name : '-'}</div>
            <div className="s">{an.weekday.peak ? `${num1(an.weekday.peak.share_pct)}% ของรายจ่าย 90 วัน${isCur ? 'ล่าสุด' : 'ถึงสิ้นเดือน'}` : 'ข้อมูลยังไม่พอ'}</div>
          </div>
          <div className="pl-metric" data-m="anomaly">
            <div className="l">หมวดที่สูงผิดปกติ</div>
            <div className="v">{top ? top.name : 'ไม่พบ'}</div>
            <div className={`s${top ? ' bad' : ''}`}>{top ? `${baht(top.amount)} สูงกว่าค่าเฉลี่ย ${num1(top.pct_vs_expected)}%` : an.data.has_baseline ? 'ทุกหมวดอยู่ในระดับปกติของคุณ' : 'ยังไม่มีค่าเฉลี่ยให้เทียบ'}</div>
          </div>
          <div className="pl-metric" data-m="projection">
            <div className="l">{isCur ? 'คาดการณ์รายจ่ายสิ้นเดือน' : 'รายจ่ายทั้งเดือน'}</div>
            <div className="v">{proj.expense_end === null ? '-' : baht(isCur ? proj.expense_end : an.totals.expense)}</div>
            <div className={`s${proj.over_income ? ' bad' : ''}`}>{proj.expense_end === null ? (isCur ? 'ยังคาดการณ์ไม่ได้' : 'ไม่มีรายจ่ายในเดือนนั้น') : proj.income_ref ? `เทียบรายรับอ้างอิง ${baht(proj.income_ref)} (${num1(proj.pct_of_income)}%)` : 'ยังไม่มีรายรับให้เทียบ'}</div>
          </div>
        </div>
        {an.small_purchases.flagged && (
          <p className="pl-note" data-small>รายจ่ายน้อยกว่า {an.small_purchases.threshold} บาทมี {an.small_purchases.count} ครั้งใน {an.small_purchases.days} วัน รวม {baht(an.small_purchases.total)} ({num1(an.small_purchases.share_pct)}% ของรายจ่าย)</p>
        )}
        {an.weekday.reliable && (
          <>
            <div className="pl-days" role="img" aria-label={`รายจ่ายรายวันของสัปดาห์ ${isCur ? 'ย้อนหลัง' : 'ในช่วง'} 90 วัน`} data-days>
              {an.weekday.by_day.map((d) => (
                <div key={d.day} className={`pl-day${d.day === peakDay.day ? ' peak' : ''}`}>
                  <i style={{ height: `${Math.max(2, Math.round((d.amount / maxDay) * 70))}px` }} />
                  <span>{DAY_SHORT[d.day]}</span>
                </div>
              ))}
            </div>
            <p className="pl-days-cap">สัดส่วนรายจ่ายรายวันของสัปดาห์ ({isCur ? 'ย้อนหลัง 90 วัน' : '90 วันถึงสิ้นเดือน'})</p>
          </>
        )}
        {catRows.length > 0 && (
          <details className="pl-details" data-cat-details>
            <summary>ดูรายจ่ายรายหมวดเทียบค่าเฉลี่ย</summary>
            <table className="pl-table">
              <thead><tr><th>หมวด</th><th>เดือนนี้</th><th>ค่าเฉลี่ยของคุณ</th><th>เทียบ</th></tr></thead>
              <tbody>
                {catRows.map((c) => (
                  <tr key={c.category_id} data-cat-row>
                    <td>{c.name}</td>
                    <td>{baht(c.amount)}</td>
                    <td>{c.expected_to_date === null ? '-' : baht(c.expected_to_date)}</td>
                    <td className={c.flagged ? 'flag' : ''}>{c.pct_vs_expected === null ? '-' : `${c.pct_vs_expected > 0 ? '+' : ''}${num1(c.pct_vs_expected)}%`}{c.flagged ? ' ⚠️' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="pl-grid">
        {/* ===== 2 คำแนะนำ (ของ AI และของระบบ รวมเป็นรายการเดียว) ===== */}
        <div className="card" data-plan-advice>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconSpark size={18} /></span>คำแนะนำ</>} label="คำอธิบายส่วนนี้" popId="pl-info-advice">
              <p>ป้าย “AI” คือคำแนะนำที่ AI เขียนจากตัวเลขสรุปเมื่อคุณกดขอ (ไม่ส่งรายการรายตัวหรือบันทึกช่วยจำ) ระบบตรวจตัวเลขในข้อความทุกตัวก่อนแสดง ถ้าไม่ตรงกับที่ระบบคำนวณจะไม่แสดงข้อนั้น ป้าย “ระบบ” คำนวณด้วยกฎ ใช้ได้ตลอดแม้ไม่ใช้ AI คำแนะนำเป็นแนวทางเรื่องงบประมาณและการออมเท่านั้น ไม่เกี่ยวกับการลงทุน</p>
            </InfoTitle>
            {isCur && ai.configured && !aiBusy && (
              <button type="button" className="pl-link" data-ai-ask onClick={askAi} disabled={ai.plans_used_today >= ai.plan_daily_limit}>
                <IconSpark size={14} />{saved ? 'วิเคราะห์ใหม่' : 'ให้ AI วิเคราะห์'}
              </button>
            )}
          </div>

          {aiBusy && (
            <div className="pl-busy" data-ai-busy-wrap>
              <span data-ai-busy>AI กำลังเขียนคำแนะนำ... {aiElapsed} วินาที</span>
              <button type="button" className="pl-link" data-ai-cancel onClick={cancelAdvice}>ยกเลิก</button>
            </div>
          )}
          {aiMsg && <p className="pl-msg" role="alert" data-ai-msg>{aiMsg}</p>}

          {aiItems.map((it, i) => (
            <div className="pl-item" key={`ai-${i}`} data-ai-item>
              <AdviceIcon tag={it.tag} />
              <div className="tx">
                <div>{it.text}<span className="pl-badge ai" data-badge>AI</span></div>
                <div className="pl-chips" data-chips>
                  <Chips facts={it.facts_used} />
                  <span className="pl-rate">
                    <button type="button" aria-pressed={it.rating === 1} aria-label="คำแนะนำนี้เป็นประโยชน์" data-rate-up onClick={() => rate(i, 1)}><IconThumb size={15} /></button>
                    <button type="button" aria-pressed={it.rating === -1} aria-label="คำแนะนำนี้ไม่เป็นประโยชน์" data-rate-down onClick={() => rate(i, -1)}><IconThumb size={15} down /></button>
                  </span>
                </div>
              </div>
            </div>
          ))}
          {sysItems.map((it, i) => (
            <div className="pl-item" key={`sys-${i}`} data-rule-item>
              <AdviceIcon tag={it.tag} />
              <div className="tx">
                <div>{it.text}<span className="pl-badge" data-badge>ระบบ</span></div>
                {it.facts_used && it.facts_used.length > 0 && <div className="pl-chips" data-chips><Chips facts={it.facts_used} /></div>}
              </div>
            </div>
          ))}

          {isCur && !ai.configured && <p className="pl-empty" data-ai-unavailable>ระบบนี้ยังไม่เปิดบริการ AI ดูคำแนะนำจากระบบได้</p>}
          {!isCur && !saved && <p className="pl-empty" data-ai-past-note>เดือนนั้นไม่มีคำแนะนำของ AI ที่เก็บไว้ ขอ AI วิเคราะห์ได้เฉพาะเดือนปัจจุบัน</p>}
          {saved && saved.stale && <p className="pl-stale" role="status" data-ai-stale>{isCur ? 'ข้อมูลของคุณเปลี่ยนไปหลังจาก AI เขียน ตัวเลขในคำแนะนำอาจไม่ตรงแล้ว กด “วิเคราะห์ใหม่” เพื่ออัปเดต' : 'รายการของเดือนนั้นถูกแก้ไขหลังจาก AI เขียน ตัวเลขในคำแนะนำอาจไม่ตรงแล้ว (ขอ AI ใหม่ได้เฉพาะเดือนปัจจุบัน)'}</p>}
          {saved && <p className="pl-note" data-ai-generated>AI เขียนเมื่อ {new Date(saved.generated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}{' '}<button type="button" className="pl-link" style={{ fontSize: 12 }} data-ai-delete onClick={dropAdvice}>ลบคำแนะนำของ AI</button></p>}
          {aiDropped > 0 && <p className="pl-note" data-ai-dropped>AI เสนอเพิ่มอีก {aiDropped} ข้อที่ตัวเลขไม่ตรงกับที่ระบบคำนวณ ระบบจึงไม่แสดง</p>}

          <div className="pl-foot">
            <p className="pl-note" data-disclaimer>ตัวเลขทุกตัวคำนวณจากรายการของคุณโดยระบบ AI เป็นผู้เขียนคำอธิบาย ไม่ใช่คำแนะนำทางการเงินจากผู้เชี่ยวชาญ</p>
            {isCur && ai.configured && <p className="pl-note" data-ai-usage>วันนี้ขอไปแล้ว {ai.plans_used_today}/{ai.plan_daily_limit} ครั้ง</p>}
          </div>
        </div>

        {/* ===== 3 เป้าหมายการออม (เรื่องระยะยาว: แสดงทุกเดือน สถานะ ณ ปัจจุบันเสมอ ไม่ขึ้นกับเดือนที่ดู) ===== */}
        <div className="card" data-plan-goals>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconFlag size={18} /></span>เป้าหมายการออม</>} label="คำอธิบายส่วนนี้" popId="pl-info-goals">
              <p>ระบบเทียบ “ที่ต้องออมต่อเดือนให้ทันกำหนด” กับ “เงินเหลือเฉลี่ยต่อเดือน” (รายรับลบรายจ่ายของเดือนเต็มก่อนหน้า) ซึ่งเป็นเงินที่เหลือให้แบ่งมาออมได้ ไม่ใช่ยอดที่ออมไปแล้ว ยอด “ออมแล้ว” ตอนนี้กรอกเอง (กดแก้ไขเมื่อออมเพิ่ม) เป้าหมายแสดงสถานะ ณ ปัจจุบันเสมอ ไม่ขึ้นกับเดือนที่ดู ตั้งได้สูงสุด {data.max_goals} เป้าหมาย</p>
            </InfoTitle>
            <button type="button" className="pl-link" data-goal-add disabled={data.goals.length >= data.max_goals} title={data.goals.length >= data.max_goals ? `ตั้งได้สูงสุด ${data.max_goals} เป้าหมาย` : ''} onClick={() => setGoalModal({ goal: null })}>+ เพิ่มเป้าหมาย</button>
          </div>
          {data.goals.length === 0 ? (
            <p className="pl-empty" data-goals-empty>ยังไม่มีเป้าหมาย ตั้งเป้าหมายเพื่อดูว่าต้องออมเดือนละเท่าไรและจะถึงเมื่อไร</p>
          ) : (
            data.goals.map((g) => {
              const st = goalStatus(g);
              const more = g.status === 'reached' ? null : goalLine(g).text;
              return (
                <div className="pl-goal" key={g.goal_id} data-goal-item>
                  <div className="pl-goal-top">
                    <span className="pl-goal-name">{g.name}</span>
                    <span className="pl-goal-meta">เป้า {baht(g.target_amount)} · ภายใน {thaiMonthYearShort(g.target_date)}</span>
                    <span className="pl-goal-tools">
                      <button type="button" aria-label={`แก้ไขเป้าหมาย ${g.name}`} title="แก้ไข" data-goal-edit onClick={() => setGoalModal({ goal: g })}><IconEdit size={15} /></button>
                      <button type="button" aria-label={`ลบเป้าหมาย ${g.name}`} title="ลบ" data-goal-del onClick={() => setConfirmDel(g.goal_id)}><IconTrash size={15} /></button>
                    </span>
                  </div>
                  <div className={`pl-bar${st.cls === 'warn' ? ' warn' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.progress_pct} aria-label={`ความคืบหน้า ${g.name}`}><i style={{ width: `${g.progress_pct}%` }} /></div>
                  <div className="pl-goal-sum" data-goal-line>{goalSummary(g)}<span className={`pl-status ${st.cls}`} data-goal-status>{st.text}</span></div>
                  {more && (
                    <details className="pl-goal-more" data-goal-more>
                      <summary>รายละเอียด</summary>
                      <p>{more} (กำหนด {thaiDate(g.target_date)})</p>
                    </details>
                  )}
                  {confirmDel === g.goal_id && (
                    <div className="pl-confirm" data-goal-confirm>
                      <span>ลบเป้าหมายนี้?</span>
                      <button type="button" className="btn btn-sm btn-danger" data-goal-del-yes onClick={() => delGoal(g.goal_id)}>ลบ</button>
                      <button type="button" className="btn btn-sm btn-light" data-goal-del-no onClick={() => setConfirmDel(null)}>ยกเลิก</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {error && data && <p className="pl-msg" role="alert">{error}</p>}
        </div>
      </div>

      {goalModal && (
        <GoalModal
          goal={goalModal.goal}
          onClose={() => setGoalModal(null)}
          onSaved={async () => { setGoalModal(null); await load(); }}
        />
      )}
      {showConsent && (
        <AiConsentModal
          scope="plan"
          version={ai.plan_consent_version}
          onAccepted={() => { setShowConsent(false); setData((d) => ({ ...d, ai: { ...d.ai, plan_enabled: true } })); runAdvice(); }}
          onDeclined={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}
