const JobRun = require('../models/JobRun');

const KEEP = 10; // เก็บ 10 รอบล่าสุดต่องาน

async function recordJobRun({ job, trigger, startedAt, rules = 0, created = 0, errors = [], ok = true }) {
  try {
    await JobRun.create({ job, trigger, startedAt, finishedAt: new Date(), rules, created, problems: errors.slice(0, 20), ok });
    const old = await JobRun.find({ job }).sort({ startedAt: -1 }).skip(KEEP).select('_id').lean();
    if (old.length > 0) await JobRun.deleteMany({ _id: { $in: old.map((d) => d._id) } });
  } catch (e) {
    console.error('recordJobRun error:', e.message); // การบันทึกประวัติไม่ควรทำให้งานหลักล้มเหลว
  }
}

module.exports = { recordJobRun, KEEP };
