// ทดสอบว่าคีย์ Gemini ใช้ได้และตอบเร็วแค่ไหน (ไม่ต้องมีไฟล์รูป) อ่านคีย์จาก backend\.env ไม่พิมพ์คีย์
//   node tools\pingGemini.js          ส่งรูปเล็กที่มีข้อความ "TOTAL 90.00 / DATE 2026-10-23" ให้ Gemini 1 ครั้ง
//   node tools\pingGemini.js 5        ทำซ้ำ 5 ครั้ง แล้วสรุปเวลา
require('dotenv').config();
const IMG = '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';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('ยังไม่ได้ตั้ง GEMINI_API_KEY ใน backend\\.env'); process.exit(1); }
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
const n = Math.min(10, Math.max(1, parseInt(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || '1', 10)));
const gen = { temperature: 0.1, maxOutputTokens: 300, responseMimeType: 'application/json' };
const lv = process.env.GEMINI_THINKING_LEVEL;
if (lv && lv !== 'none') gen.thinkingConfig = { thinkingLevel: lv };
else if (!lv && /gemini-3\.8/.test(model)) gen.thinkingConfig = { thinkingLevel: 'low' };
else if (lv !== 'none' && /gemini-2\.5-flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };
const body = { contents: [{ role: 'user', parts: [{ text: 'Read the text in this image. Reply with only JSON: {"total": number, "date": "YYYY-MM-DD"}' }, { inline_data: { mime_type: 'image/png', data: IMG } }] }], generationConfig: gen };

async function once(i) {
  const t0 = Date.now();
  const sec = () => (Date.now() - t0) / 1000;
  try {
    const r = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    const text = await r.text();
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map((p) => p.text || '').join('')) || (j.error && (j.error.message || j.error.status)) || msg;
    } catch (e) { /* แสดงข้อความดิบ */ }
    const good = r.status === 200 && /90/.test(msg) && /2026-10-23/.test(msg);
    console.log(`รอบ ${i}: HTTP ${r.status} ใช้เวลา ${sec().toFixed(1)} วินาที ${good ? '✓ ผลถูกต้อง' : '✗'} | ${String(msg).replace(/\s+/g, ' ').slice(0, 160)}`);
    return { ok: good, t: sec() };
  } catch (e) {
    console.log(`รอบ ${i}: ล้มเหลว ${e.name} หลังรอ ${sec().toFixed(1)} วินาที`);
    return { ok: false, t: sec() };
  }
}

(async () => {
  console.log(`ทดสอบ Gemini (${model}) จำนวน ${n} รอบ`);
  const res = [];
  for (let i = 1; i <= n; i += 1) {
    res.push(await once(i));
    if (i < n) await new Promise((r) => setTimeout(r, 7000)); // เว้นช่วงเผื่อโควต้าต่อนาทีของแผนฟรี
  }
  if (n > 1) {
    const okT = res.filter((x) => x.ok).map((x) => x.t).sort((a, b) => a - b);
    console.log(`\nสรุป: สำเร็จ ${okT.length}/${n} รอบ` + (okT.length ? ` | เร็วสุด ${okT[0].toFixed(1)} | กลาง ${okT[Math.floor(okT.length / 2)].toFixed(1)} | ช้าสุด ${okT[okT.length - 1].toFixed(1)} วินาที` : ''));
  }
})();
