const crypto = require('crypto');

// ลายนิ้วมือของ "ข้อมูลที่ใช้เขียนคำแนะนำ" ตอนที่ AI เขียน ใช้เทียบภายหลังว่าข้อมูลเปลี่ยนไปหรือยัง (เพิ่ม/แก้/ลบรายการ หรือแก้เป้าหมาย)
// ไม่รวมวันที่/จำนวนวันที่ผ่านไป ดังนั้นแค่เวลาผ่านไปคำแนะนำจะไม่ถูกมองว่าเก่า (เก็บเฉพาะค่าที่มาจากข้อมูลของผู้ใช้)
const hash = (obj) => crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

// ข้อมูลรายการของเดือนนั้น + ค่าเฉลี่ยของเดือนอ้างอิง (แก้รายการเดือนก่อนหน้าก็ทำให้ค่าเปรียบเทียบเปลี่ยน)
function dataSignature(analysis) {
  const cats = analysis.categories.map((c) => [c.category_id, c.amount]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return hash({
    n: analysis.data.txn_count,
    i: analysis.totals.income,
    e: analysis.totals.expense,
    c: cats,
    b: [analysis.baseline.months, analysis.baseline.avg_income_month, analysis.baseline.avg_expense_month],
  });
}

// เป้าหมายการออม (ใช้เฉพาะเดือนปัจจุบัน เพราะเป้าหมายเป็นเรื่องของ "ตอนนี้")
function goalsSignature(goalEvals) {
  return hash(goalEvals.map((g) => [g.name, g.target_amount, g.saved_amount, g.target_date]));
}

// คำแนะนำของ AI ที่เก็บไว้ "เก่า" หรือไม่: ลายนิ้วมือตอนเขียนไม่ตรงกับข้อมูลตอนนี้ (รุ่นที่เก็บไว้ก่อนมีลายนิ้วมือ = ไม่ทราบ ไม่เตือน)
function isStale(saved, analysis, goalEvals) {
  if (!saved || !saved.data_sig) return false;
  if (saved.data_sig !== dataSignature(analysis)) return true;
  if (analysis.is_current && saved.goals_sig && saved.goals_sig !== goalsSignature(goalEvals)) return true;
  return false;
}

module.exports = { dataSignature, goalsSignature, isStale };
