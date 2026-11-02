const mongoose = require('mongoose');

module.exports = mongoose.model('Recurring', new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  type:      { type: String, enum: ['income', 'expense'], required: true },
  amount:    { type: Number, required: true, min: 0.01 },
  note:      { type: String, default: '' },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  startDate: { type: Date, required: true },
  endDate:   { type: Date, default: null },
  nextRun:   { type: Date, required: true },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true }));