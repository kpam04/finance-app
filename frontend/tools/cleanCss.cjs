#!/usr/bin/env node
/*
 * cleanCss.cjs - ล้าง index.css: ลบกฎที่ไม่มีโค้ดตัวไหนใช้ และกฎที่ซ้ำกันทุกตัวอักษร
 *
 * วิธีใช้ (รันในโฟลเดอร์ frontend):
 *   node tools\cleanCss.cjs            ดูรายงานก่อน (ยังไม่แก้ไฟล์)
 *   node tools\cleanCss.cjs --apply    ลบจริง (สำรองไฟล์เดิมไว้ข้างกันเสมอ)
 * ตัวเลือก:  --css src\index.css   ไฟล์ CSS ที่จะล้าง
 *            --src src             โฟลเดอร์โค้ดที่ใช้ตรวจว่าคลาสไหนถูกใช้
 *
 * ลบเฉพาะ 2 อย่างที่ไม่ทำให้หน้าตาเปลี่ยน:
 *   1) กฎที่ใช้คลาสซึ่งไม่ปรากฏในโค้ดใน src เลย (รวมถึง index.html) จึงไม่มีองค์ประกอบไหนได้รับกฎนั้น
 *      - คลาสที่ประกอบชื่อด้วยโค้ด เช่น `jobs-status-${x}` นับว่าใช้ (ดูจากส่วนหน้าของชื่อ)
 *      - คลาสที่ react-router ใส่ให้เอง (active / pending / transitioning) นับว่าใช้
 *      - กฎที่มีตัวเลือกซับซ้อน (:not() :is() :where() :has() [class...]) ไม่แตะ
 *      - ตัวเลือกที่ไม่มีคลาสเลย (แท็ก เช่น h1, input, body) ไม่แตะ
 *   2) กฎที่ซ้ำกันทุกตัวอักษร (ตัวเลือกเดียวกัน ค่าเหมือนกัน อยู่ใน @media เดียวกัน) ลบตัวที่อยู่ก่อน เก็บตัวหลังสุด
 *      (ลำดับการทับกันของกฎจึงเหมือนเดิม)
 * นอกจากนี้ลบตัวแปร --xxx ที่ไม่มี var(--xxx) ใช้ที่ไหนเลย และ @keyframes ที่ไม่มี animation อ้างถึง
 */
const fs = require('fs');
const path = require('path');

let postcss;
try {
  // postcss มากับ Vite อยู่แล้ว ปกติไม่ต้องติดตั้งเพิ่ม
  postcss = require(require.resolve('postcss', { paths: [process.cwd()] }));
} catch (e) {
  console.error('หา postcss ไม่เจอ: รัน  npm i -D postcss  ในโฟลเดอร์ frontend แล้วลองใหม่');
  process.exit(1);
}

// ---------- ตัวเลือก ----------
const args = process.argv.slice(2);
const opt = { apply: false, css: 'src/index.css', src: 'src' };
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--apply') opt.apply = true;
  else if (args[i] === '--css') opt.css = args[(i += 1)];
  else if (args[i] === '--src') opt.src = args[(i += 1)];
  else { console.error(`ไม่รู้จักตัวเลือก: ${args[i]}`); process.exit(1); }
}
const cssPath = path.resolve(opt.css);
const srcDir = path.resolve(opt.src);
if (!fs.existsSync(cssPath)) { console.error(`ไม่พบไฟล์ CSS: ${cssPath}`); process.exit(1); }
if (!fs.existsSync(srcDir)) { console.error(`ไม่พบโฟลเดอร์โค้ด: ${srcDir}`); process.exit(1); }

// ---------- อ่านโค้ดทั้งหมดที่อาจใช้คลาส ----------
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.html', '.mjs', '.cjs', '.vue', '.svelte']);
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name.startsWith('.')) continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(name.name))) out.push(p);
  }
  return out;
}
const files = walk(srcDir);
const htmlRoot = path.join(path.dirname(srcDir), 'index.html'); // index.html อยู่นอก src ตามโครงของ Vite
if (fs.existsSync(htmlRoot)) files.push(htmlRoot);
const sourceText = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// โทเค็นทุกคำที่ปรากฏในโค้ด (รวมในคอมเมนต์ จึงเป็นการตรวจแบบระมัดระวัง: ไม่ลบเกินจริง)
const tokens = new Set(sourceText.match(/[A-Za-z_][\w-]*/g) || []);
// คลาสที่ประกอบชื่อด้วยโค้ด: `abc-${x}` หรือ 'abc-' + x -> ส่วนหน้า "abc-"
const prefixes = new Set();
for (const m of sourceText.matchAll(/([A-Za-z_][\w-]*-)\$\{/g)) prefixes.add(m[1]);
for (const m of sourceText.matchAll(/(['"`])([A-Za-z_][\w-]*-)\1\s*\+/g)) prefixes.add(m[2]);
const PROTECTED = new Set(['active', 'pending', 'transitioning']); // คลาสที่ react-router NavLink ใส่ให้เอง
const classUsed = (c) => PROTECTED.has(c) || tokens.has(c) || [...prefixes].some((p) => c.startsWith(p));

// ---------- วิเคราะห์ CSS ----------
const original = fs.readFileSync(cssPath, 'utf8');
const root = postcss.parse(original);
const report = { unusedRules: [], unusedSelectors: [], duplicates: [], emptyAtRules: [], vars: [], keyframes: [], orphanComments: 0 };

const COMPLEX = /:(not|is|where|has)\(|\[class|\\/;
// คลาสทั้งหมดในตัวเลือกหนึ่งตัว (ไม่นับที่อยู่ในสตริงของ attribute)
const classesOf = (sel) => [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_A-Za-z][\w-]*)/g)].map((m) => m[1]);
const selectorUnused = (sel) => {
  if (COMPLEX.test(sel)) return false; // ซับซ้อน ไม่แตะ
  const cs = classesOf(sel);
  return cs.length > 0 && cs.some((c) => !classUsed(c));
};
const inKeyframes = (node) => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true; return false; };
const ctxName = (node) => { const parts = []; for (let p = node.parent; p && p.type !== 'root'; p = p.parent) parts.unshift(`@${p.name} ${p.params}`); return parts.join(' > ') || 'ระดับบนสุด'; };
const lineOf = (node) => (node.source && node.source.start ? node.source.start.line : '?');

// 1) กฎที่ใช้คลาสที่ไม่มีใครใช้
const removeWithComment = (node) => {
  const prev = node.prev();
  if (prev && prev.type === 'comment' && !/={3,}/.test(prev.text) && !/\n/.test(prev.text.trim())) { prev.remove(); report.orphanComments += 1; }
  node.remove();
};
root.walkRules((rule) => {
  if (inKeyframes(rule)) return;
  const sels = rule.selectors;
  const dead = sels.filter(selectorUnused);
  if (dead.length === 0) return;
  if (dead.length === sels.length) {
    report.unusedRules.push({ sel: rule.selector.replace(/\s+/g, ' '), line: lineOf(rule), ctx: ctxName(rule) });
    removeWithComment(rule);
  } else {
    report.unusedSelectors.push({ sel: dead.join(', '), line: lineOf(rule) });
    rule.selectors = sels.filter((s) => !dead.includes(s));
  }
});

// 2) กฎที่ซ้ำกันทุกตัวอักษร: เก็บตัวหลังสุด ลบตัวก่อนหน้า (ภายใน container เดียวกัน)
const normDecls = (rule) => rule.nodes.filter((n) => n.type === 'decl').map((d) => `${d.prop.trim().toLowerCase()}:${d.value.replace(/\s+/g, ' ').trim()}${d.important ? '!important' : ''}`).join(';');
const dupScan = (container) => {
  const seen = new Map();
  const dupNodes = [];
  container.each((node) => {
    if (node.type === 'rule' && !inKeyframes(node)) {
      if (node.nodes.some((n) => n.type !== 'decl' && n.type !== 'comment')) return; // มีกฎซ้อน ไม่เทียบ
      const key = `${node.selectors.map((s) => s.replace(/\s+/g, ' ').trim()).join(',')}{${normDecls(node)}}`;
      if (!normDecls(node)) return;
      if (seen.has(key)) dupNodes.push(seen.get(key));
      seen.set(key, node);
    }
  });
  for (const n of dupNodes) {
    report.duplicates.push({ sel: n.selector.replace(/\s+/g, ' '), line: lineOf(n), ctx: ctxName(n) });
    removeWithComment(n);
  }
  container.each((node) => { if (node.type === 'atrule' && node.nodes && !/keyframes$/i.test(node.name)) dupScan(node); });
};
dupScan(root);
// @media ที่เหมือนกันทั้งก้อน (พารามิเตอร์และเนื้อหาเท่ากัน) ลบก้อนก่อนหน้า
(function dupAtRules(container) {
  const seen = new Map(); const dead = [];
  container.each((node) => {
    if (node.type === 'atrule' && node.nodes && !/keyframes$/i.test(node.name)) {
      const key = `@${node.name} ${node.params.replace(/\s+/g, ' ')}{${node.nodes.filter((n) => n.type !== 'comment').map((n) => n.toString().replace(/\s+/g, ' ')).join('')}}`;
      if (seen.has(key)) dead.push(seen.get(key));
      seen.set(key, node);
    }
  });
  for (const n of dead) { report.duplicates.push({ sel: `@${n.name} ${n.params} (ทั้งก้อน)`, line: lineOf(n), ctx: ctxName(n) }); removeWithComment(n); }
}(root));

// 3) @keyframes ที่ไม่มีใครอ้างถึง
const cssAfterRules = root.toString();
root.walkAtRules(/keyframes$/i, (at) => {
  const used = new RegExp(`animation(-name)?\\s*:[^;{}]*\\b${at.params.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(cssAfterRules) || tokens.has(at.params);
  if (!used) { report.keyframes.push({ sel: `@keyframes ${at.params}`, line: lineOf(at) }); at.remove(); }
});

// 4) ตัวแปร --xxx ที่ไม่มี var(--xxx) ใช้เลย (ทั้งใน CSS และโค้ด)
const cssNow = root.toString();
root.walkDecls(/^--/, (d) => {
  const name = d.prop;
  const used = cssNow.includes(`var(${name}`) || sourceText.includes(`var(${name}`) || sourceText.includes(`'${name}'`) || sourceText.includes(`"${name}"`);
  if (!used) { report.vars.push({ sel: name, line: lineOf(d) }); d.remove(); }
});

// 5) @media ที่ว่างหลังลบ และหัวข้อคอมเมนต์ที่เหลือโดยไม่มีกฎใต้หัวข้อ
(function pruneEmpty(container) {
  container.each((node) => {
    if (node.type === 'atrule' && node.nodes) {
      pruneEmpty(node);
      if (node.nodes.every((n) => n.type === 'comment')) { report.emptyAtRules.push({ sel: `@${node.name} ${node.params}`, line: lineOf(node) }); removeWithComment(node); }
    }
  });
}(root));
{
  const nodes = [];
  root.each((n) => nodes.push(n));
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.type === 'comment' && /={3,}/.test(n.text)) {
      let hasContent = false;
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (nodes[j].type === 'comment' && /={3,}/.test(nodes[j].text)) break;
        if (nodes[j].type !== 'comment' && nodes[j].parent) { hasContent = true; break; }
      }
      if (!hasContent) { n.remove(); report.orphanComments += 1; }
    }
  }
}

// ---------- ตรวจความถูกต้องหลังล้าง ----------
let cleaned = root.toString().replace(/\n{3,}/g, '\n\n');
const problems = [];
try { postcss.parse(cleaned); } catch (e) { problems.push(`ผลลัพธ์อ่านเป็น CSS ไม่ได้: ${e.message}`); }
// ทุกคลาสที่ "ถูกใช้" และมีกฎใน CSS เดิม ต้องยังมีกฎอยู่ครบ (ยกเว้นกฎที่ซ้ำกันทุกตัวอักษร ซึ่งเหลือตัวหลังสุดไว้)
const cls = (cssText) => {
  const m = new Map();
  postcss.parse(cssText).walkRules((r) => { if (inKeyframes(r)) return; for (const s of r.selectors) { if (selectorUnused(s)) continue; /* ตัวเลือกที่มีคลาสไม่มีใครใช้ ถูกลบโดยเจตนา */ for (const c of classesOf(s)) m.set(c, (m.get(c) || new Set()).add(`${ctxName(r)}|${s.replace(/\s+/g, ' ').trim()}`)); } });
  return m;
};
const before = cls(original); const after = cls(cleaned);
for (const [c, set] of before) {
  const left = after.get(c) || new Set();
  for (const key of set) if (!left.has(key)) problems.push(`คลาสที่ใช้อยู่ ".${c}" สูญเสียตัวเลือก: ${key}`);
}

// ---------- รายงาน ----------
const lines = (arr, f) => arr.map(f).join('\n');
const origLines = original.split('\n').length; const newLines = cleaned.split('\n').length;
console.log(`ตรวจ ${files.length} ไฟล์ใน ${path.relative(process.cwd(), srcDir) || '.'} | CSS: ${path.relative(process.cwd(), cssPath)} (${origLines} บรรทัด)`);
console.log(`พบคลาสที่ประกอบชื่อด้วยโค้ด (ถือว่าใช้): ${[...prefixes].join(' ') || '-'}`);
console.log('');
console.log(`1) กฎที่ไม่มีโค้ดใช้ (ลบทั้งกฎ): ${report.unusedRules.length}`);
if (report.unusedRules.length) console.log(lines(report.unusedRules, (r) => `   บรรทัด ${String(r.line).padStart(4)}  ${r.sel.slice(0, 90)}${r.ctx !== 'ระดับบนสุด' ? `   [${r.ctx}]` : ''}`));
console.log(`2) ตัวเลือกที่ไม่มีโค้ดใช้ (ตัดออกจากกฎที่ยังมีตัวอื่นใช้): ${report.unusedSelectors.length}`);
if (report.unusedSelectors.length) console.log(lines(report.unusedSelectors, (r) => `   บรรทัด ${String(r.line).padStart(4)}  ${r.sel.slice(0, 90)}`));
console.log(`3) กฎที่ซ้ำกันทุกตัวอักษร (ลบตัวก่อนหน้า): ${report.duplicates.length}`);
if (report.duplicates.length) console.log(lines(report.duplicates, (r) => `   บรรทัด ${String(r.line).padStart(4)}  ${r.sel.slice(0, 90)}${r.ctx !== 'ระดับบนสุด' ? `   [${r.ctx}]` : ''}`));
console.log(`4) @keyframes ที่ไม่มีใครใช้: ${report.keyframes.length}  |  ตัวแปร CSS ที่ไม่มีใครใช้: ${report.vars.length}  |  @media ที่ว่างหลังลบ: ${report.emptyAtRules.length}  |  คอมเมนต์ที่เหลือลอย: ${report.orphanComments}`);
if (report.keyframes.length) console.log(lines(report.keyframes, (r) => `   บรรทัด ${String(r.line).padStart(4)}  ${r.sel}`));
if (report.vars.length) console.log(lines(report.vars, (r) => `   บรรทัด ${String(r.line).padStart(4)}  ${r.sel}`));
console.log('');
console.log(`ผล: ${origLines} -> ${newLines} บรรทัด (ลดลง ${origLines - newLines})`);
if (problems.length) {
  console.log('\nพบความผิดปกติ (ไม่แก้ไฟล์):');
  console.log(lines(problems, (p) => `  - ${p}`));
  process.exit(2);
}
console.log('ตรวจหลังล้าง: ผ่าน (อ่านเป็น CSS ได้ และทุกคลาสที่ใช้อยู่ยังมีกฎครบเหมือนเดิม)');

if (!opt.apply) {
  console.log('\nนี่เป็นโหมดดูรายงาน ยังไม่ได้แก้ไฟล์ ถ้าเห็นด้วยให้รันซ้ำด้วย:  node tools\\cleanCss.cjs --apply');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
const backup = `${cssPath}.backup_${stamp}`;
fs.copyFileSync(cssPath, backup);
fs.writeFileSync(cssPath, cleaned, 'utf8');
console.log(`\nแก้ไขแล้ว: ${path.relative(process.cwd(), cssPath)}`);
console.log(`ไฟล์เดิมสำรองไว้ที่: ${path.relative(process.cwd(), backup)}  (ย้อนกลับด้วยการคัดลอกไฟล์นี้ทับ)`);
console.log('ขั้นต่อไป: รัน  npm run build  เพื่อยืนยันว่า build ผ่าน แล้วเปิดดูหน้าเว็บทุกหน้าที่คุณใช้บ่อย');
