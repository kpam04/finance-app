const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  type:      { type: String, enum: ['income', 'expense'], required: true },
  amount:    { type: Number, required: true, min: 0.01 },
  note:      { type: String, default: '' },
  date:      { type: Date, required: true },
  recurring: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurring', default: null },
}, { timestamps: true });

schema.index({ user: 1, date: -1 });
schema.index({ user: 1, type: 1 });

// กันสร้างรายการซ้ำจากกฎเดียวกันในวันเดียวกัน (ใช้กับ cron / การรันซ้ำ)
schema.index(
  { recurring: 1, date: 1 },
  { unique: true, partialFilterExpression: { recurring: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Transaction', schema);
