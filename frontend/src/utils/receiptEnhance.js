// ปรับรูปใบเสร็จให้ OCR อ่านง่ายขึ้น (ทำในเบราว์เซอร์อัตโนมัติ ผู้ใช้ไม่ต้องทำอะไร)
//  1) แปลงเป็นขาวดำ
//  2) กลับสีเฉพาะบริเวณ "ตัวอักษรสว่างบนพื้นเข้ม" เช่น แถบหัวสีเขียวตัวหนังสือขาวในใบเสร็จจากแอป
//     (เงาบนใบเสร็จกระดาษ ตัวหนังสือยังเข้มกว่าพื้น จึงไม่ถูกกลับสี)
//  3) ยืดความต่างของสีทั้งภาพ (auto contrast)
// รับ/คืนข้อมูลพิกเซล RGBA (ImageData.data) แก้ไขในที่เดิม เป็นฟังก์ชันล้วน ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์

const DARK_MEAN = 160; // บล็อกที่ค่าเฉลี่ยต่ำกว่านี้ถือว่าเป็นพื้นเข้ม
const EDGE = 40; // ห่างจากค่าเฉลี่ยเท่านี้ = เป็นพิกเซลตัวอักษร (สว่างกว่า/เข้มกว่าพื้น)

export function enhanceReceiptPixels(data, w, h) {
  const n = w * h;
  const g = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

  // แบ่งเป็นบล็อก แล้วดูว่าบล็อกไหนเป็นพื้นเข้มที่มีตัวอักษรสว่าง
  const B = Math.max(16, Math.min(64, Math.round(Math.min(w, h) / 24)));
  const bw = Math.ceil(w / B);
  const bh = Math.ceil(h / B);
  const dark = new Uint8Array(bw * bh);
  const lightText = new Uint8Array(bw * bh);
  for (let by = 0; by < bh; by += 1) {
    for (let bx = 0; bx < bw; bx += 1) {
      const x0 = bx * B; const y0 = by * B;
      const x1 = Math.min(w, x0 + B); const y1 = Math.min(h, y0 + B);
      let sum = 0; let cnt = 0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { sum += g[y * w + x]; cnt += 1; }
      const mean = sum / cnt;
      if (mean >= DARK_MEAN) continue;
      let bright = 0; let darker = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const v = g[y * w + x];
          if (v > mean + EDGE) bright += 1;
          else if (v < mean - EDGE) darker += 1;
        }
      }
      const k = by * bw + bx;
      dark[k] = 1;
      if (bright > darker && bright >= cnt * 0.01) lightText[k] = 1;
    }
  }

  // กลับสีบล็อกที่มีตัวอักษรสว่าง และบล็อกพื้นเข้มที่อยู่ติดกัน (ขยาย 4 รอบ เพื่อให้ทั้งแถบเป็นพื้นเดียวกัน ไม่เป็นลายตาราง)
  let inv = lightText.slice();
  for (let pass = 0; pass < 4; pass += 1) {
    const next = inv.slice();
    for (let by = 0; by < bh; by += 1) {
      for (let bx = 0; bx < bw; bx += 1) {
        const k = by * bw + bx;
        if (next[k] || !dark[k]) continue;
        for (let dy = -1; dy <= 1 && !next[k]; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const yy = by + dy; const xx = bx + dx;
            if (yy >= 0 && yy < bh && xx >= 0 && xx < bw && inv[yy * bw + xx]) { next[k] = 1; break; }
          }
        }
      }
    }
    inv = next;
  }

  // กลับสี แล้วยืดให้พื้น (ที่เคยเข้ม) กลายเป็นขาว ตัวอักษร (ที่เคยสว่าง) เป็นดำ
  const out = g;
  let any = false;
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y += 1) {
    const row = Math.floor(y / B) * bw;
    for (let x = 0; x < w; x += 1) {
      if (!inv[row + Math.floor(x / B)]) continue;
      const i = y * w + x;
      out[i] = 255 - out[i];
      hist[out[i]] += 1;
      any = true;
    }
  }
  if (any) {
    let total = 0;
    for (let v = 0; v < 256; v += 1) total += hist[v];
    let acc = 0; let median = 128;
    for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= total / 2) { median = v; break; } }
    const top = Math.max(40, median * 0.92);
    for (let y = 0; y < h; y += 1) {
      const row = Math.floor(y / B) * bw;
      for (let x = 0; x < w; x += 1) {
        if (!inv[row + Math.floor(x / B)]) continue;
        const i = y * w + x;
        out[i] = Math.min(255, (out[i] * 255) / top);
      }
    }
  }

  // ยืดความต่างทั้งภาพ: ตัดปลาย 1% ทั้งมืดและสว่าง
  const all = new Uint32Array(256);
  for (let i = 0; i < n; i += 1) all[out[i]] += 1;
  const cut = n * 0.01;
  let lo = 0; let hi = 255; let acc = 0;
  for (let v = 0; v < 256; v += 1) { acc += all[v]; if (acc > cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v -= 1) { acc += all[v]; if (acc > cut) { hi = v; break; } }
  const range = hi - lo;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const v = range > 10 ? ((out[i] - lo) * 255) / range : out[i];
    const c = v < 0 ? 0 : v > 255 ? 255 : v;
    data[p] = c; data[p + 1] = c; data[p + 2] = c; data[p + 3] = 255;
  }
  return { inverted: any };
}
