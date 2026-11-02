// สร้างแอป Express (ไม่เชื่อมฐานข้อมูล ไม่ listen) เพื่อให้ทดสอบได้ จุดเริ่มระบบจริงอยู่ที่ server.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const { trustProxyFor, corsOriginsFor, intEnv } = require('./utils/runtimeConfig');

const tooMany = (req, res) => res.status(429).json({ success: false, message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
const limiter = (windowMs, limit, extra = {}) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler: tooMany, ...extra });

function createApp({ env = process.env, mount } = {}) {
  const isProd = env.NODE_ENV === 'production';
  const app = express();

  app.set('trust proxy', trustProxyFor(env));
  app.disable('x-powered-by');

  // ---------- header ความปลอดภัย ----------
  // CSP: หน้าเว็บนี้โหลดทุกอย่างจากโดเมนตัวเอง (มี <style> ในคอมโพเนนต์จึงต้องอนุญาต inline style) เริ่มต้นเป็นโหมด "รายงานอย่างเดียว"
  // (ไม่บล็อกอะไร ดูการละเมิดได้ใน Console ของเบราว์เซอร์) เมื่อตรวจแล้วไม่มีข้อความเตือน ตั้ง CSP_MODE=enforce เพื่อบังคับใช้ / CSP_MODE=off เพื่อปิด
  const cspMode = env.CSP_MODE || 'report';
  app.use(helmet({
    contentSecurityPolicy: cspMode === 'off' ? false : {
      useDefaults: false,
      reportOnly: cspMode !== 'enforce',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // ---------- CORS: เปิดเฉพาะเมื่อกำหนด FRONTEND_ORIGIN (คั่นด้วย , ได้หลายต้นทาง) ----------
  const origins = corsOriginsFor(env);
  if (origins.length) app.use(cors({ origin: origins }));

  app.use(express.json({ limit: '100kb' }));

  // ---------- ตรวจสุขภาพ (ไม่นับเข้าตัวจำกัดอัตรา ใช้กับ Render health check) ----------
  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });

  // ---------- จำกัดอัตรา (ตัวเลขเริ่มต้นตั้งให้หลวม เพราะคนในห้องเรียน/มหาวิทยาลัยมักใช้ IP เดียวกัน ปรับได้ผ่าน Environment) ----------
  const min15 = 15 * 60 * 1000;
  // ทั้ง API: ต่อ IP
  app.use('/api', limiter(intEnv(env.RATE_LIMIT_WINDOW_MS, min15), intEnv(env.RATE_LIMIT_MAX, 3000)));
  // เข้าสู่ระบบ: นับเฉพาะครั้งที่ล้มเหลวต่อ IP (กันเดารหัสข้ามหลายอีเมล) ครั้งที่สำเร็จไม่นับ ส่วนการเดารหัสของอีเมลเดียวมีตัวจำกัดเดิมใน auth.js
  app.use('/api/auth/login', limiter(min15, intEnv(env.LOGIN_IP_LIMIT, 60), { skipSuccessfulRequests: true }));
  // สมัครสมาชิก: นับเฉพาะครั้งที่สมัครสำเร็จต่อ IP ต่อชั่วโมง (กันสร้างบัญชีจำนวนมาก)
  app.use('/api/auth/register', limiter(60 * 60 * 1000, intEnv(env.REGISTER_IP_LIMIT, 30), { skipFailedRequests: true }));

  // ---------- เส้นทาง API ----------
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/categories', require('./routes/categories'));
  app.use('/api/transactions', require('./routes/transactions'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/budgets', require('./routes/budgets'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/recurring', require('./routes/recurring'));
  app.use('/api/admin', require('./routes/admin'));
  if (typeof mount === 'function') mount(app); // ใช้ในชุดทดสอบเท่านั้น

  // ---------- เสิร์ฟหน้าเว็บที่ build แล้ว (frontend/dist) ----------
  const dist = env.FRONTEND_DIST || path.join(__dirname, '..', 'frontend', 'dist');
  const hasDist = fs.existsSync(path.join(dist, 'index.html'));
  if (hasDist) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
    app.use(express.static(dist, { index: false }));
  } else {
    app.get('/', (req, res) => res.json({ success: true, message: 'Finance API is running (ยังไม่ได้ build หน้าเว็บ: ใช้ npm run dev ในโฟลเดอร์ frontend)' }));
  }

  // API ที่ไม่มีอยู่ ตอบ JSON
  app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'ไม่พบ API นี้' }));

  // หน้าอื่น ๆ (เช่น /dashboard เมื่อรีเฟรช) ส่ง index.html ให้ React Router จัดการ
  if (hasDist) {
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // ---------- ตัวจัดการข้อผิดพลาดสุดท้าย: ตอบ JSON ข้อความทั่วไป ไม่รั่วรายละเอียดภายใน ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป' });
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ success: false, message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' });
    const status = err && (err.status || err.statusCode);
    if (res.headersSent) return next(err);
    if (status === 404) return res.status(404).type('text/plain').send('Not found'); // ไฟล์ใน /assets ที่ไม่มีอยู่ (เช่น ชื่อไฟล์เก่าหลัง deploy ใหม่)
    if (status >= 400 && status < 500) return res.status(status).json({ success: false, message: 'คำขอไม่ถูกต้อง' });
    if (err && err.code === 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR') console.error('[config]', err.message);
    console.error('[error]', isProd ? err && err.message : err);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของระบบ' });
  });

  return app;
}

module.exports = { createApp };
