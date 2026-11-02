const Recurring = require('../models/Recurring');
const Transaction = require('../models/Transaction');
const checkBudgetAlert = require('./budgetAlert');

const MAX_PER_RULE_PER_RUN = 366; // กันสร้างรายการย้อนหลังเยอะเกินไปในครั้งเดียว

// "วันนี้" ตามเวลาไทย เก็บเป็น UTC เที่ยงคืน (รูปแบบเดียวกับวันที่ของ transaction)
function todayTH() {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  return new Date(Date.UTC(th.getUTCFullYear(), th.getUTCMonth(), th.getUTCDate()));
}

/**
 * เลื่อนวันตามความถี่
 * monthly/yearly ยึด "วันที่ของวันเริ่มต้น" (anchorDay) เป็นหลัก ถ้าเดือนนั้นมีวันไม่ถึงจะใช้วันสุดท้ายของเดือน
 * เช่น เริ่ม 31 ม.ค. -> 28 ก.พ. -> 31 มี.ค. -> 30 เม.ย. (ไม่ไหลไปเดือนถัดไป และไม่เพี้ยนสะสม)
 */
function addInterval(date, frequency, anchorDay) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  if (frequency === 'daily') return new Date(Date.UTC(y, m, d + 1));
  if (frequency === 'weekly') return new Date(Date.UTC(y, m, d + 7));

  const step = frequency === 'yearly' ? 12 : 1;
  const total = m + step;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(anchorDay, daysInMonth)));
}

// หา "รอบถัดไปที่ไม่ก่อนวันนี้" (ใช้ตอนเปิดใช้งานกฎที่หยุดไว้ จะได้ไม่สร้างรายการย้อนหลังที่ค้างตอนหยุด)
function nextOnOrAfter(rule, today) {
  const anchor = rule.startDate.getUTCDate();
  let cur = rule.nextRun;
  let guard = 0;
  while (cur < today && guard++ < 5000) cur = addInterval(cur, rule.frequency, anchor);
  return cur;
}

/**
 * สร้าง transaction จากกฎที่ถึงกำหนด
 * - รองรับกรณีระบบหยุดหลายวัน (ไล่สร้างย้อนหลังทีละรอบจนถึงวันนี้)
 * - กันสร้างซ้ำด้วย unique index (recurring + date) ในโมเดล Transaction
 * options: { userId, today } (ไม่ใส่ = ทุกผู้ใช้ / วันนี้ตามเวลาไทย)
 */
async function runDueRecurring({ userId, today } = {}) {
  const now = today || todayTH();
  const query = { isActive: true, nextRun: { $lte: now } };
  if (userId) query.user = userId;

  const rules = await Recurring.find(query);
  let created = 0;
  const errors = [];

  for (const r of rules) {
    try {
      const anchor = r.startDate.getUTCDate();
      let cur = r.nextRun;
      let steps = 0;

      while (cur <= now && steps < MAX_PER_RULE_PER_RUN) {
        if (r.endDate && cur > r.endDate) break;
        steps += 1;

        try {
          await Transaction.create({
            user: r.user,
            category: r.category,
            type: r.type,
            amount: r.amount,
            note: r.note,
            date: cur,
            recurring: r._id,
          });
          created += 1;
          if (r.type === 'expense') await checkBudgetAlert(r.user, r.category, cur);
        } catch (e) {
          if (e.code !== 11000) throw e; // 11000 = รอบนี้ถูกสร้างไปแล้ว ข้ามได้
        }

        cur = addInterval(cur, r.frequency, anchor);
      }

      const finished = !!(r.endDate && cur > r.endDate);
      await Recurring.updateOne(
        { _id: r._id, nextRun: r.nextRun },
        { $set: finished ? { nextRun: cur, isActive: false } : { nextRun: cur } }
      );
    } catch (e) {
      console.error(`Recurring rule ${r._id} failed:`, e.message);
      errors.push(`กฎ ${String(r._id).slice(-6)}: ${e.message}`.slice(0, 200)); // ไม่เก็บข้อมูลการเงิน
    }
  }

  return { rules: rules.length, created, errors };
}

module.exports = { runDueRecurring, addInterval, nextOnOrAfter, todayTH };
