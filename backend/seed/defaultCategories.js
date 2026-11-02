const Category = require('../models/Category');

// sortOrder = ลำดับที่แสดงในรายการหมวด (น้อยไปมาก) เว้นห่างกัน 10 เพื่อแทรกหมวดใหม่ระหว่างกลางได้ "อื่นๆ" = 900 อยู่ท้ายสุดของหมวดมาตรฐานเสมอ
const DEFAULTS = [
  { name: 'เงินเดือน',        type: 'income',  color: '#16a34a', sortOrder: 10 },
  { name: 'รายได้เสริม',      type: 'income',  color: '#22c55e', sortOrder: 20 },
  { name: 'ของขวัญ/โบนัส',    type: 'income',  color: '#84cc16', sortOrder: 30 },
  { name: 'อาหาร',            type: 'expense', color: '#f97316', sortOrder: 10 },
  { name: 'เดินทาง',          type: 'expense', color: '#0ea5e9', sortOrder: 20 },
  { name: 'ที่พัก/ค่าเช่า',   type: 'expense', color: '#8b5cf6', sortOrder: 30 },
  { name: 'ช้อปปิ้ง',         type: 'expense', color: '#ec4899', sortOrder: 40 },
  { name: 'สาธารณูปโภค',      type: 'expense', color: '#eab308', sortOrder: 50 },
  { name: 'สุขภาพ',           type: 'expense', color: '#ef4444', sortOrder: 60 },
  { name: 'บันเทิง',          type: 'expense', color: '#a855f7', sortOrder: 70 },
  { name: 'การศึกษา',         type: 'expense', color: '#14b8a6', sortOrder: 80 },
  { name: 'สัตว์เลี้ยง',      type: 'expense', color: '#b45309', sortOrder: 90 },
  { name: 'บริการสมาชิก',     type: 'expense', color: '#6366f1', sortOrder: 100 },
  { name: 'อื่นๆ',            type: 'expense', color: '#64748b', sortOrder: 900 },
];

module.exports = async function seedDefaultCategories() {
  for (const c of DEFAULTS) {
    const { sortOrder, ...fields } = c;
    // สร้างเมื่อยังไม่มี (ไม่ทับชื่อ/สีของหมวดเดิม) และอัปเดตเฉพาะลำดับให้หมวดมาตรฐานทุกครั้งที่เริ่มระบบ
    await Category.updateOne(
      { user: null, name: c.name, type: c.type },
      { $setOnInsert: { ...fields, user: null, isDefault: true }, $set: { sortOrder } },
      { upsert: true }
    );
  }
  console.log('Default categories ready');
};