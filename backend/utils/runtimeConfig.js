// ตั้งค่าและตรวจสภาพแวดล้อมตอนเริ่มระบบ (ฟังก์ชันล้วน ทดสอบได้ ไม่แตะเครือข่าย/ฐานข้อมูล)

const WEAK_SECRETS = ['secret', 'changeme', 'change_me', 'jwt_secret', 'your_jwt_secret', 'your-secret', 'password', '12345678', 'test', 'dev'];

// ตรวจตัวแปรที่จำเป็น: errors = ต้องแก้ก่อนเริ่ม (ใน production จะหยุดระบบ) / warnings = แจ้งเตือนเฉย ๆ
function validateEnv(env) {
  const isProd = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  if (!env.MONGO_URI) errors.push('ไม่ได้ตั้ง MONGO_URI (ที่อยู่ฐานข้อมูล)');
  else if (!/^mongodb(\+srv)?:\/\//.test(env.MONGO_URI)) errors.push('MONGO_URI ต้องขึ้นต้นด้วย mongodb:// หรือ mongodb+srv://');

  const secret = env.JWT_SECRET || '';
  if (!secret) {
    (isProd ? errors : warnings).push('ไม่ได้ตั้ง JWT_SECRET (ใช้เซ็นบัตรผ่านเข้าสู่ระบบ)');
  } else if (WEAK_SECRETS.includes(secret.toLowerCase())) {
    (isProd ? errors : warnings).push('JWT_SECRET เป็นค่าที่เดาง่าย ให้สร้างค่าสุ่มใหม่');
  } else if (secret.length < 32) {
    (isProd ? errors : warnings).push('JWT_SECRET สั้นเกินไป (ควรอย่างน้อย 32 ตัวอักษร แนะนำ 64)');
  }

  if (isProd && !env.CONTACT_EMAIL) warnings.push('ไม่ได้ตั้ง CONTACT_EMAIL (อีเมลติดต่อที่แสดงให้ผู้ใช้เห็น)');
  for (const k of ['TOKEN_HOURS_USER', 'TOKEN_HOURS_ADMIN']) {
    if (env[k] !== undefined && !(Number(env[k]) > 0)) warnings.push(`${k} ต้องเป็นตัวเลขมากกว่า 0 (ตอนนี้ใช้ค่าเริ่มต้นแทน)`);
  }
  return { isProd, errors, warnings };
}

// DNS: เครื่องคุณใช้ 8.8.8.8 / 1.1.1.1 แก้ปัญหาหา Atlas ไม่เจอ ใช้เฉพาะตอนพัฒนา บนเซิร์ฟเวอร์จริงใช้ DNS ของระบบ (เว้นแต่สั่งผ่าน DNS_SERVERS)
function dnsServersFor(env) {
  if (env.DNS_SERVERS) return env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
  return env.NODE_ENV === 'production' ? null : ['8.8.8.8', '1.1.1.1'];
}

// trust proxy: หลัง proxy ของ Render (1 ชั้น) ต้องเชื่อ X-Forwarded-For เพื่อให้ req.ip เป็นของผู้ใช้จริง (ใช้ในตัวจำกัดการเดารหัสและจำกัดอัตรา)
function trustProxyFor(env) {
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== '') {
    const n = Number(env.TRUST_PROXY);
    return Number.isInteger(n) && n >= 0 ? n : false;
  }
  return env.NODE_ENV === 'production' ? 1 : 0;
}

// รายการต้นทางที่อนุญาตให้เรียก API ข้ามโดเมน (ว่าง = ไม่เปิด CORS ซึ่งเหมาะกับการเสิร์ฟหน้าเว็บและ API จากที่เดียวกัน)
function corsOriginsFor(env) {
  return (env.FRONTEND_ORIGIN || '').split(',').map((s) => s.trim()).filter((s) => s && s !== '*');
}

const intEnv = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

module.exports = { validateEnv, dnsServersFor, trustProxyFor, corsOriginsFor, intEnv };
