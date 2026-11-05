const mongoose = require('mongoose');

// เป้าหมายการออมของผู้ใช้ (สูงสุด 5 เป้าหมายต่อคน)
const schema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:          { type: String, required: true, maxlength: 60 },
  target_amount: { type: Number, required: true, min: 0.01 },
  saved_amount:  { type: Number, default: 0, min: 0 },
  target_date:   { type: Date, required: true },
}, { timestamps: true });

schema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model('Goal', schema);
