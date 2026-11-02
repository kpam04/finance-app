const express = require('express');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Category = require('../models/Category');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};

// เดือน/ปีที่ต้องการ (ถ้าไม่ระบุใช้เดือนปัจจุบันตามเวลาไทย)
function resolvePeriod(query) {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  let month = parseInt(query.month, 10);
  let year = parseInt(query.year, 10);
  if (!(month >= 1 && month <= 12)) month = th.getUTCMonth() + 1;
  if (!(year >= 2000 && year <= 2100)) year = th.getUTCFullYear();
  return { month, year };
}

// ช่วงวันที่ของเดือน (start รวม, end ไม่รวม)
const monthRange = (year, month) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 1)),
});

// ยอดรวมรายรับ/รายจ่ายในช่วงเวลา
async function totalsFor(userObjId, start, end) {
  const rows = await Transaction.aggregate([
    { $match: { user: userObjId, date: { $gte: start, $lt: end } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const t = { income: 0, expense: 0 };
  rows.forEach((r) => { t[r._id] = r.total; });
  return t;
}

// รายจ่ายแยกตามหมวด (เรียงมากไปน้อย)
function expenseByCategory(userObjId, start, end) {
  return Transaction.aggregate([
    { $match: { user: userObjId, type: 'expense', date: { $gte: start, $lt: end } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
    { $unwind: '$cat' },
    { $project: { _id: 1, category_name: '$cat.name', color: '$cat.color', total: 1 } },
    { $sort: { total: -1 } },
  ]);
}

// ---------- สรุปข้อมูลแดชบอร์ด ----------
router.get('/summary', async (req, res) => {
  try {
    const userObjId = new mongoose.Types.ObjectId(req.userId);
    const { month, year } = resolvePeriod(req.query);
    const { start, end } = monthRange(year, month);

    // ยอดรวมเดือนนี้ และเดือนก่อน
    const totals = await totalsFor(userObjId, start, end);
    const prevRange = monthRange(year, month - 1);
    const prevTotals = await totalsFor(userObjId, prevRange.start, prevRange.end);

    // ยอดสะสมยกมา = (รายรับ - รายจ่าย) ของทุกรายการที่บันทึกไว้ก่อนต้นเดือนที่เลือก (ไม่รวมเงินที่มีอยู่ก่อนเริ่มบันทึก)
    // คงเหลือสะสมสิ้นเดือน = ยอดสะสมยกมา + รายรับ - รายจ่ายของเดือนที่เลือก
    const beforeTotals = await totalsFor(userObjId, new Date(0), start);
    const openingBalance = round(beforeTotals.income - beforeTotals.expense);
    const closingBalance = round(openingBalance + totals.income - totals.expense);

    // สัดส่วนรายจ่ายตามหมวด
    const byCat = (await expenseByCategory(userObjId, start, end)).map((c) => ({
      category_name: c.category_name,
      color: c.color,
      total: round(c.total),
    }));

    // แนวโน้ม 6 เดือนล่าสุด
    const trendStart = new Date(Date.UTC(year, month - 6, 1));
    const trendRows = await Transaction.aggregate([
      { $match: { user: userObjId, date: { $gte: trendStart, $lt: end } } },
      {
        $group: {
          _id: { ym: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const trend = {};
    for (let i = 5; i >= 0; i--) {
      const ym = new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7);
      trend[ym] = { month: ym, income: 0, expense: 0 };
    }
    trendRows.forEach((r) => {
      if (trend[r._id.ym]) trend[r._id.ym][r._id.type] = round(r.total);
    });

    res.json({
      success: true,
      data: {
        period: { month, year },
        total_income: round(totals.income),
        total_expense: round(totals.expense),
        balance: round(totals.income - totals.expense), // ส่วนต่างของเดือนนี้ (ค่าเดิม)
        opening_balance: openingBalance,
        closing_balance: closingBalance,
        expense_by_category: byCat,
        monthly_trend: Object.values(trend),
        previous_month: { income: round(prevTotals.income), expense: round(prevTotals.expense) },
      },
    });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

// ---------- Insight อัตโนมัติ (rule-based) ----------
router.get('/insights', async (req, res) => {
  try {
    const userObjId = new mongoose.Types.ObjectId(req.userId);
    const { month, year } = resolvePeriod(req.query);
    const { start, end } = monthRange(year, month);
    const prevRange = monthRange(year, month - 1);

    const current = await totalsFor(userObjId, start, end);
    const previous = await totalsFor(userObjId, prevRange.start, prevRange.end);
    const insights = [];

    // 1) เทียบรายจ่ายกับเดือนก่อน
    if (previous.expense > 0) {
      const diff = round(((current.expense - previous.expense) / previous.expense) * 100, 1);
      if (diff > 5) {
        insights.push(`รายจ่ายเดือนนี้สูงกว่าเดือนก่อน ${diff}% ควรทบทวนรายการใช้จ่ายที่ไม่จำเป็น`);
      } else if (diff < -5) {
        insights.push(`รายจ่ายเดือนนี้ลดลง ${Math.abs(diff)}% เมื่อเทียบกับเดือนก่อน ทำได้ดีมาก!`);
      } else {
        insights.push('รายจ่ายเดือนนี้ใกล้เคียงกับเดือนก่อนหน้า');
      }
    } else if (current.expense > 0) {
      insights.push('นี่คือเดือนแรกที่มีการบันทึกรายจ่าย ระบบจะเริ่มเปรียบเทียบแนวโน้มได้ตั้งแต่เดือนถัดไป');
    }

    // 2) หมวดที่ใช้จ่ายสูงสุด
    const cats = await expenseByCategory(userObjId, start, end);
    if (cats.length > 0 && current.expense > 0) {
      const pct = round((cats[0].total / current.expense) * 100, 1);
      insights.push(`หมวดหมู่ "${cats[0].category_name}" มีสัดส่วนรายจ่ายสูงสุด คิดเป็น ${pct}% ของรายจ่ายทั้งเดือน`);
    }

    // 3) อัตราการออม
    if (current.income > 0) {
      const rate = round(((current.income - current.expense) / current.income) * 100, 1);
      if (rate < 0) {
        insights.push('เดือนนี้ใช้จ่ายมากกว่ารายรับ ควรวางแผนงบประมาณเพิ่มเติม');
      } else if (rate < 10) {
        insights.push(`อัตราการออมเดือนนี้อยู่ที่ ${rate}% ของรายรับ ลองตั้งเป้าหมายออมอย่างน้อย 20%`);
      } else {
        insights.push(`อัตราการออมเดือนนี้อยู่ที่ ${rate}% ของรายรับ ถือว่าอยู่ในเกณฑ์ดี`);
      }
    }

    // 4) งบประมาณที่ใกล้เต็ม/เกิน (ไม่นับงบที่ผู้ใช้ปิดไว้เดือนนี้ หรือหยุดใช้แล้ว: งบเดิมที่ไม่มีฟิลด์เหล่านี้ถือว่าเปิดใช้)
    const budgets = await Budget.find({ user: req.userId, month, year, stopped: { $ne: true }, enabled: { $ne: false } });
    const catIds = budgets.map((b) => b.category);
    const catDocs = catIds.length ? await Category.find({ _id: { $in: catIds } }).lean() : [];
    const catName = new Map(catDocs.map((c) => [String(c._id), c.name]));
    const spentMap = new Map(cats.map((c) => [String(c._id), c.total]));
    budgets.forEach((b) => {
      const name = catName.get(String(b.category));
      if (!name || b.amountLimit <= 0) return;
      const spent = spentMap.get(String(b.category)) || 0;
      const usedPct = round((spent / b.amountLimit) * 100, 1);
      if (usedPct >= 100) {
        insights.push(`งบประมาณหมวด \"${name}\" ใช้เกินแล้ว (${usedPct}% ของวงเงิน)`);
      } else if (usedPct >= b.alertThreshold) {
        insights.push(`งบประมาณหมวด \"${name}\" ใกล้เต็มวงเงินแล้ว (${usedPct}%)`);
      }
    });

    if (insights.length === 0) {
      insights.push('ยังไม่มีข้อมูลเพียงพอสำหรับการวิเคราะห์ในเดือนนี้ ลองบันทึกรายการเพิ่มเติม');
    }

    res.json({ success: true, data: { insights } });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  }
});

module.exports = router;