const mongoose = require('mongoose');

// บันทึกการเรียก AI แต่ละครั้งแบบ "ไม่เก็บเนื้อหา" (ไม่มีข้อความ/รูป/ยอดเงิน) เพื่อใช้วัดผลในรายงาน:
// อัตราสำเร็จ ความหน่วง และอัตราที่ผู้ใช้ต้องแก้ไขรายการที่ AI สกัดได้ (แยกตามฟิลด์)
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['parse-text'], default: 'parse-text' },
  inputSource: { type: String, enum: ['typed', 'voice'], default: 'typed' },
  model: { type: String, default: '' },
  ok: { type: Boolean, default: true },
  errorCode: { type: String, default: '' },
  latencyMs: { type: Number, default: 0 },
  redactions: { type: Number, default: 0 },
  itemsReturned: { type: Number, default: 0 },
  // ผลที่ผู้ใช้ตัดสินใจกับรายการที่ AI สกัด (นับต่อรายการ)
  confirmed: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  cancelled: { type: Number, default: 0 },
  editedAmount: { type: Number, default: 0 },
  editedCategory: { type: Number, default: 0 },
  editedDate: { type: Number, default: 0 },
  editedType: { type: Number, default: 0 },
  editedNote: { type: Number, default: 0 },
  // ผลเทียบ "กฎ vs AI" (ผู้ใช้กดปุ่ม "ให้ AI ช่วยตรวจ" ในหน้ายืนยัน): เทียบกี่ครั้ง ฟิลด์ไหนที่ AI เห็นต่างจากฟอร์ม ผู้ใช้เลือกฝั่งไหน และเวลารวมที่ผู้ใช้รอ
  compared: { type: Number, default: 0 },
  diffAmount: { type: Number, default: 0 },
  diffCategory: { type: Number, default: 0 },
  diffDate: { type: Number, default: 0 },
  diffType: { type: Number, default: 0 },
  diffNote: { type: Number, default: 0 },
  adopted: { type: Number, default: 0 },
  kept: { type: Number, default: 0 },
  clientMsTotal: { type: Number, default: 0 },
  // กรณีผู้ใช้เก็บผลของกฎไว้ แล้วกดยืนยัน: แก้ฟิลด์ไหนจากที่กฎอ่านได้ (ใช้วัดความแม่นของกฎเทียบกับ AI)
  rulesConfirmed: { type: Number, default: 0 },
  rulesEditedAmount: { type: Number, default: 0 },
  rulesEditedCategory: { type: Number, default: 0 },
  rulesEditedDate: { type: Number, default: 0 },
  rulesEditedType: { type: Number, default: 0 },
  rulesEditedNote: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // เก็บ 1 ปี

module.exports = mongoose.model('AiEvent', schema);
