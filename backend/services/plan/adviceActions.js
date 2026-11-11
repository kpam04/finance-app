// แนบ "ประเภท" (group) และ "ปุ่มลงมือทำ" (actions) ให้คำแนะนำทุกข้อ ทั้งของระบบและของ AI
// ดูจากข้อเท็จจริงที่คำแนะนำข้อนั้นอ้างถึง (facts_used) จึงใช้ได้กับข้อความที่ AI เขียนด้วย
// actions (สูงสุด 3 ปุ่ม):
//   set_budget  { category_id, name, amount }  ตั้งงบหมวดที่ยังไม่มีงบ (ค่าเฉลี่ยต่อเดือนปัดขึ้นเป็นหลักร้อย) เฉพาะเดือนปัจจุบัน
//   view_budget { category_id }                 หมวดนี้มีงบแล้ว → ไปหน้างบ
//   view_txns   { category_id? }                เปิดหน้ารายการ กรองหมวด (ถ้ามี) และเดือนที่ดู
//   simulate    {}                               เปิด "ลองปรับเอง"
//   new_goal    { amount? }                      ตั้งเป้าหมายออมใหม่
//   view_inst   {}                               ไปแท็บรายการผ่อน
const MAX_ACTIONS = 3;
const ceil100 = (n) => Math.max(100, Math.ceil(Number(n) / 100) * 100);

function groupOf(item, goalEvals) {
  if (item.group) return item.group;
  const ids = (item.facts_used || []).map((f) => f.id);
  if (item.tag === 'warning') return 'watch';
  if (item.tag === 'goal') {
    const gi = ids.map((id) => /^g(\d)_/.exec(id)).find(Boolean);
    const g = gi ? goalEvals[Number(gi[1])] : null;
    if (g && g.status === 'on_track') return 'good';
    if (g && ['behind', 'no_surplus', 'overdue'].includes(g.status)) return 'watch';
    return 'save';
  }
  if (ids.includes('savings_rate') || ids.includes('save_pct_proj') || ids.includes('avg_daily_pct')) {
    const f = (item.facts_used || []).find((x) => x.id === 'avg_daily_pct');
    if (!f || f.value < 0) return 'good';
  }
  return 'save';
}

function actionsOf(item, { current, anomalies = [], budgetCats = new Set(), goalEvals = [] }) {
  const ids = (item.facts_used || []).map((f) => f.id);
  const out = [];
  const add = (a) => { if (out.length < MAX_ACTIONS && !out.some((x) => x.type === a.type)) out.push(a); };
  const ci = ids.map((id) => /^cat(\d)_/.exec(id)).find(Boolean);
  const cat = ci ? anomalies[Number(ci[1])] : null;
  if (cat) {
    if (budgetCats.has(String(cat.category_id))) add({ type: 'view_budget', category_id: String(cat.category_id) });
    else if (current && cat.base_avg) add({ type: 'set_budget', category_id: String(cat.category_id), name: cat.name, amount: ceil100(cat.base_avg) });
    add({ type: 'view_txns', category_id: String(cat.category_id) });
  }
  if (current) {
    const gi = ids.map((id) => /^g(\d)_/.exec(id)).find(Boolean);
    const g = gi ? goalEvals[Number(gi[1])] : null;
    if (g && ['behind', 'no_surplus'].includes(g.status)) add({ type: 'simulate' });
    if (ids.includes('projection') && item.tag === 'warning') add({ type: 'simulate' });
    if (ids.includes('inst_free')) {
      const f = item.facts_used.find((x) => x.id === 'inst_free');
      add({ type: 'new_goal', amount: f ? f.value : null });
    }
    if (ids.includes('inst_burden_pct') || ids.includes('inst_load')) add({ type: 'view_inst' });
  }
  if (ids.includes('small_count')) add({ type: 'view_txns' });
  return out;
}

function decorateAdvice(items, ctx) {
  return (items || []).map((it) => ({ ...it, group: groupOf(it, ctx.goalEvals || []), actions: actionsOf(it, ctx) }));
}

module.exports = { decorateAdvice, groupOf, actionsOf, ceil100 };
