// จำกัดการล็อกอินผิดซ้ำ: ผิด 5 ครั้งใน 15 นาที (ต่อ อีเมล + IP) บล็อก 15 นาที
// ตัวนับเก็บในหน่วยความจำ จึงรีเซ็ตเมื่อเซิร์ฟเวอร์รีสตาร์ท และไม่ล็อกทั้งบัญชี (กันคนอื่นแกล้งล็อกบัญชีเหยื่อ)
function createLimiter({ maxFails = 5, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const map = new Map(); // key -> { fails: number[], blockedUntil: number }

  function prune(t) {
    if (map.size < 5000) return;
    for (const [k, e] of map) {
      if (e.blockedUntil <= t && e.fails.every((x) => t - x >= windowMs)) map.delete(k);
    }
  }

  return {
    check(key) {
      const t = now();
      const e = map.get(key);
      if (e && e.blockedUntil > t) return { blocked: true, retryAfterSec: Math.ceil((e.blockedUntil - t) / 1000) };
      return { blocked: false, retryAfterSec: 0 };
    },
    // บันทึกว่าล็อกอินผิด 1 ครั้ง คืนสถานะว่าถูกบล็อกแล้วหรือยัง
    fail(key) {
      const t = now();
      const e = map.get(key) || { fails: [], blockedUntil: 0 };
      if (e.blockedUntil && e.blockedUntil <= t) {
        e.fails = [];
        e.blockedUntil = 0;
      }
      e.fails = e.fails.filter((x) => t - x < windowMs);
      e.fails.push(t);
      if (e.fails.length >= maxFails) {
        e.blockedUntil = t + blockMs;
        e.fails = [];
      }
      map.set(key, e);
      prune(t);
      return e.blockedUntil > t
        ? { blocked: true, retryAfterSec: Math.ceil(blockMs / 1000) }
        : { blocked: false, remaining: maxFails - e.fails.length };
    },
    reset(key) {
      map.delete(key);
    },
  };
}

module.exports = createLimiter(); // ตัวที่ใช้งานจริง
module.exports.createLimiter = createLimiter; // ไว้ทดสอบ
