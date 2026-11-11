import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import InfoTitle from '../components/InfoTitle.jsx';
import GoalModal from '../components/GoalModal.jsx';
import MonthPicker from '../components/MonthPicker.jsx';
import AiConsentModal from '../components/AiConsentModal.jsx';
import InstallmentsPanel from '../components/InstallmentsPanel.jsx';
import { IconSpark, IconFlag, IconChart, IconEdit, IconTrash, IconThumb, AdviceIcon } from '../components/PlanIcons.jsx';
import { baht, num1, thaiDate, thaiMonth, thaiMonthYearShort, chipParts, monthOptions } from '../utils/planFormat.js';

// หน้า "วางแผน": วิเคราะห์พฤติกรรมการใช้จ่าย + คำแนะนำ (จากระบบ / จาก AI) + เป้าหมายการออม + ลองปรับแผน
// ตัวเลขทั้งหมดคำนวณโดยระบบ AI เขียนเฉพาะคำอธิบายและต้องผ่านการตรวจตัวเลขก่อนแสดง
// แท็บของหน้าวางแผน (จำแท็บล่าสุดในเบราว์เซอร์ / เปิดตรงได้ด้วย ?tab=goals)
const TABS = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'goals', label: 'เป้าหมายออม' },
  { id: 'installments', label: 'รายการผ่อน' },
];
const TAB_KEY = 'finance_plan_tab';
const isTab = (t) => TABS.some((x) => x.id === t);
function readSavedTab() {
  try { const t = localStorage.getItem(TAB_KEY); return isTab(t) ? t : null; } catch { return null; }
}

const css = `
.pl-page { max-width: 1100px; margin: 0 auto; }
.pl-tabs { display: flex; gap: 6px; margin: -16px 0 16px; padding: 0 0 10px; border-bottom: 1px solid #E6E0D4; overflow-x: auto; scrollbar-width: none; }
.pl-tabs::-webkit-scrollbar { display: none; }
.pl-tab { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 9px 15px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; color: #7A7268; cursor: pointer; white-space: nowrap; transition: background 0.2s, color 0.2s, box-shadow 0.2s; }
.pl-tab:hover { background: #F1F3ED; color: #40563C; }
.pl-tab.active { background: #E8EDE4; color: #40563C; box-shadow: inset 0 0 0 1px #D7E1D1; font-weight: 700; }
.pl-tab:focus-visible { outline: 2px solid #9AAB91; outline-offset: 1px; }
.pl-tab-count { min-width: 18px; padding: 0 6px; border-radius: 999px; background: #EEF1EA; color: #5E7558; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; }
.pl-tab.active .pl-tab-count { background: #fff; }
.pl-tab-soon { padding: 0 7px; border-radius: 999px; background: #F3EFE6; color: #9a9184; font-size: 11px; font-weight: 500; line-height: 18px; }
.pl-tab.active .pl-tab-soon { background: #fff; }
@media (min-width: 641px) and (max-width: 1023px) { .pl-tabs { margin-top: -12px; } }
@media (max-width: 640px) { .pl-tabs { margin-top: -8px; padding-bottom: 8px; gap: 4px; } .pl-tab { flex: 1; justify-content: center; padding: 8px 6px; font-size: 13px; } }
.pl-gs { display: grid; gap: 12px; margin-top: 10px; }
.pl-gs-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; font-size: 13px; }
.pl-gs-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: #3F3A34; }
.pl-gs-pct { color: #6b7280; white-space: nowrap; }
.pl-gs-row .pl-bar { grid-column: 1 / -1; height: 6px; margin: 0; }
.pl-gs-more { margin-top: 12px; }
.pl-soon { text-align: center; padding: 28px 16px 30px; }
.pl-soon h3 { margin: 10px 0 6px; font-size: 17px; color: #3F3A34; }
.pl-soon p { margin: 0 auto; max-width: 460px; font-size: 13px; line-height: 1.7; color: #6b7280; }
.pl-soon ul { display: inline-grid; gap: 6px; margin: 16px auto 0; padding: 0; list-style: none; text-align: left; font-size: 13px; color: #4B4740; }
.pl-soon li::before { content: '•'; margin-right: 8px; color: #9AAB91; }
.pl-soon-icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 16px; background: #EEF1EA; color: #5E7558; }
.pl-head { margin-bottom: 14px; }
.pl-head h2 { margin: 0; }
.pl-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; }
.pl-month { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; color: #6b7280; }
.pl-month > span { white-space: nowrap; }
.pl-month .pl-month-m { width: 200px; }
.pl-month .pl-month-y { width: 96px; }
.pl-month .cs-wrap { width: 100%; }
@media (max-width: 560px) { .pl-month { display: flex; width: 100%; } .pl-month .pl-month-m { flex: 1; width: auto; min-width: 0; } }
.pl-past .pl-link { font-weight: 600; color: #3b5b8f; text-decoration: underline; }
.pl-past { display: flex; align-items: center; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #EEF2F8; color: #3b5b8f; font-size: 13px; line-height: 1.6; }
.pl-stale { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: #FDF0DC; color: #92400e; font-size: 13px; line-height: 1.6; }
.pl-limits { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; line-height: 1.6; }
.pl-limits p { margin: 0; }
.pl-limits p + p { margin-top: 4px; }
.pl-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 12px; }
.pl-metric { padding: 10px 12px; border-radius: 10px; background: #F8F6F0; min-width: 0; }
.pl-metric .l { font-size: 12px; color: #6b7280; }
.pl-metric .v { margin: 2px 0; font-size: 20px; font-weight: 600; color: #3F3A34; word-break: break-word; }
.pl-metric .s { font-size: 12px; color: #6b7280; line-height: 1.5; }
.pl-metric .s.bad { color: #b45309; }
.pl-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; align-items: end; height: 96px; margin-top: 14px; }
.pl-day { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; font-size: 11px; color: #6b7280; }
.pl-day i { display: block; width: 100%; max-width: 28px; min-height: 2px; border-radius: 4px 4px 0 0; background: #B9C8B2; }
.pl-day.peak i { background: #7E9677; }
.pl-days-cap { margin: 6px 0 0; font-size: 12px; color: #8A8177; }
.pl-details { margin-top: 12px; font-size: 13px; }
.pl-details summary { cursor: pointer; color: #4b5563; }
.pl-table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: 13px; }
.pl-table th, .pl-table td { padding: 6px 4px; text-align: right; border-bottom: 1px solid #f0ebe0; }
.pl-table th:first-child, .pl-table td:first-child { text-align: left; }
.pl-table .flag { color: #b45309; font-weight: 600; }
.pl-ti { display: inline-flex; vertical-align: -3px; margin-right: 6px; color: #6b7280; }
.pl-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.pl-grid > .card, .pl-page > .card { margin-bottom: 0; }
.pl-page > .card { margin-bottom: 14px; }
@media (min-width: 960px) { .pl-grid { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); } }
.pl-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding-bottom: 8px; border-bottom: 1px solid #f0ebe0; }
.pl-link { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border: none; background: none; font: inherit; font-size: 13px; color: #4b5563; cursor: pointer; }
.pl-link:hover:not(:disabled) { color: #40563C; text-decoration: underline; }
.pl-link:disabled { color: #b0a99c; cursor: not-allowed; }
.pl-busy { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: #4b5563; }
.pl-item { display: flex; gap: 10px; padding: 12px 0; border-top: 1px solid #f3efe6; }
.pl-item:first-of-type { border-top: none; }
.adv-ic { flex: 0 0 22px; display: inline-flex; align-items: flex-start; padding-top: 2px; }
.adv-warning { color: #d97706; } .adv-goal { color: #16a34a; } .adv-tip { color: #6b7280; }
.pl-item .tx { min-width: 0; flex: 1; font-size: 14px; line-height: 1.6; }
.pl-badge { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: #F3EFE6; color: #6b7280; font-size: 11px; font-weight: 600; vertical-align: 1px; }
.pl-badge.ai { background: #E8EDE4; color: #40563C; }
.pl-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 6px; }
.pl-chip { display: inline-block; max-width: 100%; padding: 2px 9px; border-radius: 999px; background: #EEF2F8; color: #3b5b8f; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.pl-chip b { font-weight: 600; }
.pl-rate { display: inline-flex; gap: 2px; margin-left: auto; }
.pl-rate button { display: inline-flex; padding: 3px 6px; border: 1px solid transparent; border-radius: 999px; background: none; color: #9a9185; cursor: pointer; }
.pl-rate button:hover { color: #4b5563; }
.pl-rate button[aria-pressed='true'] { background: #E8EDE4; border-color: #9AAB91; color: #40563C; }
.pl-note { margin: 8px 0 0; font-size: 12px; color: #8A8177; line-height: 1.6; }
.pl-msg { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px; }
.pl-foot { margin-top: 10px; padding-top: 10px; border-top: 1px solid #f0ebe0; }
.pl-foot .pl-note { margin: 0; }
.pl-foot .pl-note + .pl-note { margin-top: 4px; }
.pl-goal-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
@media (max-width: 1023px) { .pl-goal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .pl-goal-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
.pl-goal-grid > .card { margin-bottom: 0; }
.pl-goal { display: flex; flex-direction: column; padding: 16px 18px; }
.pl-goal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.pl-goal-name { min-width: 0; font-size: 16px; font-weight: 700; color: #3F3A34; overflow-wrap: anywhere; }
.pl-goal-meta { margin-top: 2px; font-size: 12px; color: #6b7280; }
.pl-goal-pct { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.pl-goal-pct b { font-size: 22px; color: #3F3A34; }
.pl-goal .pl-bar { margin: 6px 0 10px; }
.pl-goal-facts { display: grid; gap: 4px; margin: 0; font-size: 13px; }
.pl-goal-facts div { display: flex; justify-content: space-between; gap: 8px; }
.pl-goal-facts dt { color: #6b7280; }
.pl-goal-facts dd { margin: 0; font-weight: 600; color: #3F3A34; white-space: nowrap; }
.pl-seg { display: inline-flex; gap: 4px; margin: 0 0 14px; padding: 4px; border-radius: 12px; background: #EFEBE3; max-width: 100%; }
.pl-seg button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: none; border-radius: 9px; background: none; font: inherit; font-size: 13px; color: #7A7268; cursor: pointer; white-space: nowrap; transition: background 0.2s, color 0.2s; }
.pl-seg button:hover { color: #40563C; }
.pl-seg button.on { background: #fff; color: #40563C; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.pl-seg-n { min-width: 18px; padding: 0 6px; border-radius: 999px; background: #EEF1EA; color: #5E7558; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; }
.pl-seg-n.gold { background: #F7EBCB; color: #8A6A1F; }
.pl-seg-head { margin: 0 0 0 auto; }
.pl-add-btn { display: inline-flex; align-items: center; gap: 4px; padding: 9px 16px; border: none; border-radius: 999px; background: #7E9677; font: inherit; font-size: 14px; font-weight: 700; color: #fff; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
.pl-add-btn:hover:not(:disabled) { background: #6B8364; }
.pl-add-btn:disabled { background: #C9C3B6; cursor: not-allowed; }
.pl-add-short { display: none; }
@media (max-width: 640px) {
  .pl-seg { display: flex; } .pl-seg button { flex: 1; justify-content: center; }
  .pl-head-row { align-items: center; }
  .pl-seg-head { order: 3; width: 100%; margin: 0; }
  .pl-add-btn { order: 2; margin-left: auto; padding: 8px 14px; }
  .pl-add-full { display: none; } .pl-add-short { display: inline; }
}
.pl-add-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 180px; padding: 16px; border: 2px dashed #D5DECF; border-radius: 16px; background: transparent; font: inherit; font-size: 14px; font-weight: 600; color: #5E7558; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
.pl-add-card:hover:not(:disabled) { border-color: #9AAB91; background: rgba(241,243,237,0.6); }
.pl-add-card:disabled { color: #b0a99c; border-color: #E6E0D4; cursor: not-allowed; }
.pl-add-card small { font-size: 12px; font-weight: 400; color: #8A8177; }
.pl-add-plus { font-size: 28px; font-weight: 400; line-height: 1; }
@media (max-width: 640px) { .pl-add-card { min-height: 0; padding: 18px 16px; } }
.pl-ach-sum { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; padding: 14px 18px; border-radius: 14px; border: 1px solid #EEDDB4; background: linear-gradient(135deg, #FBF5E6, #F6EBD0); color: #6E5520; }
.pl-ach-sum-icon { font-size: 28px; line-height: 1; }
.pl-ach-sum-big { font-size: 18px; font-weight: 700; color: #5C4615; }
.pl-ach-sum-sub { margin-top: 2px; font-size: 13px; line-height: 1.6; }
.pl-ach-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 1023px) { .pl-ach-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .pl-ach-grid { grid-template-columns: minmax(0, 1fr); } .pl-ach-sum { padding: 12px 14px; } .pl-ach-sum-big { font-size: 16px; } }
.pl-ach { position: relative; padding: 14px 16px; border-radius: 14px; border: 1px solid #EFE2C2; background: #FFFCF4; box-shadow: 0 1px 4px rgba(120,90,20,0.06); }
.pl-ach-trophy { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: #F7EBCB; font-size: 18px; }
.pl-ach-name { margin-top: 8px; padding-right: 20px; font-weight: 700; color: #3F3A34; overflow-wrap: anywhere; }
.pl-ach-amt { margin-top: 2px; font-size: 18px; font-weight: 700; color: #8A6A1F; }
.pl-ach-meta { margin-top: 6px; font-size: 12px; line-height: 1.8; color: #8A8177; }
.pl-ach-pill { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.pl-ach-pill.early { background: #E4F2E6; color: #166534; }
.pl-ach-pill.late { background: #F3EFE6; color: #6b7280; }
.pl-ach-menu-wrap { position: absolute; top: 8px; right: 8px; }
.pl-ach-more { width: 28px; height: 28px; border: none; border-radius: 8px; background: none; color: #B5A88E; font-size: 18px; line-height: 1; cursor: pointer; }
.pl-ach-more:hover, .pl-ach-more[aria-expanded="true"] { background: #F6EEDA; color: #8A6A1F; }
.pl-ach-menu { position: absolute; top: 32px; right: 0; z-index: 20; display: grid; min-width: 180px; padding: 6px; border-radius: 12px; border: 1px solid #E6E0D4; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.pl-ach-menu button { padding: 8px 10px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13px; color: #3F3A34; text-align: left; cursor: pointer; }
.pl-ach-menu button:hover { background: #F5F2EA; }
.pl-ach-menu button.danger { color: #b91c1c; }
.pl-ach-line { display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 12px; padding: 8px 12px; border: 1px solid #EEDDB4; border-radius: 10px; background: #FBF5E6; font: inherit; font-size: 13px; color: #6E5520; text-align: left; cursor: pointer; transition: border-color 0.2s; }
.pl-ach-line:hover { border-color: #DDBF7A; }
.pl-ach-go { margin-left: auto; }
.pl-soon-icon.gold { background: #F7EBCB; font-size: 24px; }
.pl-cele-bg { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(40,35,25,0.4); }
.pl-cele { width: 100%; max-width: 360px; padding: 26px 22px 18px; border-radius: 18px; background: #fff; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.25); animation: pl-pop 0.25s ease-out; }
@keyframes pl-pop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pl-cele { animation: none; } }
.pl-cele-em { font-size: 40px; line-height: 1.2; }
.pl-cele h3 { margin: 6px 0 2px; color: #3F3A34; }
.pl-cele p { margin: 4px 0; font-size: 13px; line-height: 1.7; color: #6b7280; }
.pl-cele .pl-cele-name { font-size: 14px; color: #4B4740; }
.pl-cele-amt { margin: 6px 0; font-size: 26px; font-weight: 700; color: #8A6A1F; }
.pl-cele-ok { margin-top: 14px; padding: 9px 26px; border: none; border-radius: 999px; background: #7E9677; font: inherit; font-weight: 700; color: #fff; cursor: pointer; }
.pl-cele-ok:hover { background: #6B8364; }
.pl-cele-undo { margin-top: 10px; padding: 2px; border: none; background: none; font: inherit; font-size: 12px; color: #8A8177; text-decoration: underline; cursor: pointer; }
.pl-inst-sum { display: grid; gap: 6px; margin-top: 10px; font-size: 13px; }
.pl-inst-sum div { display: flex; justify-content: space-between; gap: 10px; }
.pl-inst-sum span { color: #6b7280; }
.pl-inst-sum b { color: #3F3A34; text-align: right; }
.pl-inst-sum b.over { color: #C2410C; }
.pl-goal-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 16px; text-align: center; }
.pl-goal-empty p { margin: 0; max-width: 420px; font-size: 13px; line-height: 1.7; color: #6b7280; }
.pl-add { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #C9D4C2; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: #4F6B47; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
.pl-add:hover:not(:disabled) { border-color: #9AAB91; background: #F1F3ED; }
.pl-add:disabled { color: #b0a99c; border-color: #E6E0D4; cursor: not-allowed; }
.pl-add-n { font-weight: 500; font-size: 12px; color: #8A8177; }
.pl-goal-tools { display: inline-flex; gap: 2px; }
.pl-goal-tools button { display: inline-flex; padding: 3px 5px; border: none; border-radius: 6px; background: none; color: #9a9185; cursor: pointer; }
.pl-goal-tools button:hover { color: #4b5563; background: #F3EFE6; }
.pl-bar { height: 8px; margin: 8px 0 6px; border-radius: 4px; background: #EEE9DD; overflow: hidden; }
.pl-bar i { display: block; height: 100%; background: #7E9677; }
.pl-bar.warn i { background: #d97706; }
.pl-goal-sum { font-size: 13px; line-height: 1.7; color: #4b5563; }
.pl-status { display: inline-block; margin-left: 4px; padding: 0 8px; border-radius: 999px; background: #F3EFE6; color: #6b7280; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pl-status.ok { background: #E4F2E6; color: #166534; }
.pl-status.warn { background: #FDF0DC; color: #92400e; }
.pl-goal-more { margin-top: 4px; font-size: 12.5px; color: #6b7280; }
.pl-goal-more summary { cursor: pointer; }
.pl-goal-more p { margin: 4px 0 0; line-height: 1.6; }
.pl-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 13px; }
.pl-empty { margin: 8px 0 0; font-size: 13px; color: #6b7280; line-height: 1.6; }
`;

const DAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// สถานะของเป้าหมายเป็นข้อความอ่านง่าย
function goalLine(g) {
  switch (g.status) {
    case 'reached': return { cls: 'ok', text: 'ออมครบตามเป้าหมายแล้ว' };
    case 'on_track': return { cls: 'ok', text: `ทันตามกำหนด: ต้องออมเดือนละ ${baht(g.required_monthly)} เงินเหลือเฉลี่ยต่อเดือน ${baht(g.capacity_monthly)} ถ้าแบ่งมาออมทั้งหมด คาดว่าจะถึงเป้าหมายราว ${thaiDate(g.eta_date)}` };
    case 'behind': return { cls: 'warn', text: `ยังไม่ทันตามกำหนด: ต้องออมเดือนละ ${baht(g.required_monthly)} แต่เงินเหลือเฉลี่ยต่อเดือน ${baht(g.capacity_monthly)} (ขาดเดือนละ ${baht(g.shortfall_monthly)}) ถ้าแบ่งมาออมทั้งหมด คาดว่าจะถึงเป้าหมายราว ${thaiDate(g.eta_date)} ช้ากว่ากำหนดราว ${num1(g.delay_months)} เดือน` };
    case 'no_surplus': return { cls: 'warn', text: `ยังออมไม่ได้: ช่วงที่ผ่านมารายจ่ายไม่ต่ำกว่ารายรับ (ต้องออมเดือนละ ${baht(g.required_monthly)} จึงจะทัน)` };
    case 'overdue': return { cls: 'warn', text: `เลยกำหนดแล้ว ยังขาดอีก ${baht(g.remaining)}${g.eta_date ? ` ถ้าออมในอัตราปัจจุบันจะถึงราว ${thaiDate(g.eta_date)}` : ''}` };
    default: return { cls: '', text: `ยังประเมินไม่ได้ เพราะต้องมีประวัติอย่างน้อย 1 เดือนเต็ม (ต้องออมเดือนละ ${baht(g.required_monthly)} จึงจะทัน)` };
  }
}

// บรรทัดสรุปสั้นของเป้าหมาย + ป้ายสถานะ (รายละเอียดยาวอยู่ในส่วน "รายละเอียด")
function goalSummary(g) {
  let t = `ออมแล้ว ${baht(g.saved_amount)} (${num1(g.progress_pct)}%)`;
  if (g.status !== 'reached') {
    if (g.required_monthly !== null && g.required_monthly !== undefined) t += ` · ต้องออมเดือนละ ${baht(g.required_monthly)}`;
    if (g.capacity_monthly !== null && g.capacity_monthly !== undefined) t += ` · เงินเหลือเฉลี่ยเดือนละ ${baht(g.capacity_monthly)}`;
  }
  return t;
}
function goalStatus(g) {
  switch (g.status) {
    case 'reached': return { cls: 'ok', text: 'ครบแล้ว' };
    case 'on_track': return { cls: 'ok', text: 'ทันตามกำหนด' };
    case 'behind': return { cls: 'warn', text: `ไม่ทัน ขาดเดือนละ ${baht(g.shortfall_monthly)}` };
    case 'no_surplus': return { cls: 'warn', text: 'ยังออมไม่ได้' };
    case 'overdue': return { cls: 'warn', text: `เลยกำหนด ขาดอีก ${baht(g.remaining)}` };
    default: return { cls: '', text: 'ประเมินไม่ได้' };
  }
}

// ระยะเวลาแบบอ่านง่าย: 28 วันขึ้นไป = เดือน / 14 วันขึ้นไป = สัปดาห์ / น้อยกว่านั้น = วัน
function spanText(days) {
  const d = Math.abs(days);
  if (d >= 28) return `${Math.max(1, Math.round(d / 30.4375))} เดือน`;
  if (d >= 14) return `${Math.round(d / 7)} สัปดาห์`;
  return `${Math.max(1, d)} วัน`;
}
// เป้าที่สำเร็จแล้ว: เร็ว/ตรง/ช้ากว่ากำหนด (ต่างกันไม่ถึง 7 วัน = ตรงกำหนด) ช้ากว่ากำหนดใช้สีเทา ไม่ใช้สีแดง เพราะยังไงก็ออมสำเร็จ
function timingPill(earlyDays) {
  if (earlyDays >= 7) return { cls: 'early', text: `เร็วกว่ากำหนด ${spanText(earlyDays)}` };
  if (earlyDays <= -7) return { cls: 'late', text: `ช้ากว่ากำหนด ${spanText(earlyDays)}` };
  return { cls: 'early', text: 'ตรงกำหนด' };
}
const durationText = (days) => (days < 1 ? 'ภายในวันเดียว' : `ใช้เวลา ${spanText(days)}`);

// ป้ายตัวเลขใต้คำแนะนำ (ชื่อสั้น + ค่า) ชี้ที่ป้ายเพื่อดูคำอธิบายเต็ม
function Chips({ facts }) {
  if (!facts || facts.length === 0) return null;
  return facts.map((f) => {
    const [short, value] = chipParts(f);
    return <span className="pl-chip" key={f.id} title={f.label}>{short ? `${short} ` : ''}<b>{value}</b></span>;
  });
}

export default function Plan() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiMsg, setAiMsg] = useState('');
  const [aiDropped, setAiDropped] = useState(0);
  const [showConsent, setShowConsent] = useState(false);
  const [goalModal, setGoalModal] = useState(null); // null | { goal, reopen } (goal = null เพิ่มใหม่ / reopen = ย้ายเป้าที่สำเร็จแล้วกลับ)
  const [confirmDel, setConfirmDel] = useState(null);
  const [goalView, setGoalView] = useState('active'); // แท็บเป้าหมายออม: 'active' กำลังออม / 'done' สำเร็จแล้ว
  const [inst, setInst] = useState(null); // ข้อมูลรายการผ่อน (ไม่ขึ้นกับเดือนที่ดู)
  const [instAdd, setInstAdd] = useState(0); // เพิ่มค่า = เปิดฟอร์มเพิ่มรายการผ่อน (ปุ่มที่หัวข้อ)
  const [instView, setInstView] = useState('active'); // แท็บรายการผ่อน: 'active' กำลังผ่อน / 'done' ผ่อนเสร็จแล้ว
  const [cats, setCats] = useState([]); // หมวดรายจ่าย (ใช้ในฟอร์มรายการผ่อน)
  const loadInst = useCallback(async () => {
    try {
      const r = await api.getInstallments();
      if (alive.current) setInst(r.data);
    } catch { /* โหลดไม่ได้: ส่วนรายการผ่อนแสดงข้อความกำลังโหลดค้างไว้ หน้าอื่นใช้งานได้ตามปกติ */ }
  }, []);
  useEffect(() => {
    loadInst();
    api.getCategories().then((r) => { if (alive.current) setCats(r.data.filter((c) => c.type === 'expense')); }).catch(() => {});
  }, [loadInst]);
  const [celebrate, setCelebrate] = useState(null); // เป้าที่เพิ่งออมครบ (แสดงหน้าต่างแสดงความยินดี)
  const [achMenu, setAchMenu] = useState(null); // เมนู ⋯ ของการ์ดสำเร็จแล้วที่เปิดอยู่
  useEffect(() => {
    if (!achMenu) return undefined;
    const close = (e) => { if (!e.target.closest('[data-ach-menu-wrap]')) setAchMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [achMenu]);
  useEffect(() => {
    if (!celebrate) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setCelebrate(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [celebrate]);
  const [curMonth, setCurMonth] = useState(null); // เดือนปัจจุบันตามเวลาไทย (หลังบ้านบอก) ใช้สร้างตัวเลือกเดือน
  const abortRef = useRef(null);
  const alive = useRef(true);
  const reqId = useRef(0); // ลำดับคำขอ: ถ้าเปลี่ยนเดือนเร็ว ๆ ผลของคำขอเก่าที่มาช้าจะถูกทิ้ง
  const selRef = useRef(null); // เดือนที่เลือกดู (null = เดือนปัจจุบัน)
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const [tab, setTab] = useState(() => (isTab(urlTab) ? urlTab : readSavedTab() || 'overview'));
  useEffect(() => { if (isTab(urlTab)) setTab(urlTab); }, [urlTab]); // กดลิงก์ /plan?tab=... ขณะอยู่หน้านี้
  const pickTab = (t) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
    if (params.get('tab')) {
      const next = new URLSearchParams(params);
      next.delete('tab');
      setParams(next, { replace: true });
    }
  };

  const load = useCallback(async () => {
    const id = reqId.current + 1;
    reqId.current = id;
    setError('');
    try {
      const res = await api.getPlanOverview(selRef.current || undefined);
      if (alive.current && id === reqId.current) {
        setData(res.data);
        setCurMonth(res.data.current_month);
      }
    } catch (e) {
      if (alive.current && id === reqId.current) setError(e.message || 'โหลดข้อมูลการวางแผนไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!aiBusy) return undefined;
    const t = setInterval(() => setAiElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [aiBusy]);

  const runAdvice = async () => {
    setAiMsg('');
    setAiDropped(0);
    setAiElapsed(0);
    setAiBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await api.planAdvice(ctrl.signal);
      if (ctrl.signal.aborted || !alive.current) return;
      setAiDropped(res.data.dropped || 0);
      setData((d) => ({ ...d, ai_advice: { items: res.data.items, generated_at: res.data.generated_at, model: res.data.model, stale: false }, ai: { ...d.ai, plans_used_today: d.ai.plans_used_today + 1 } }));
    } catch (e) {
      if (ctrl.signal.aborted || !alive.current || (e && e.name === 'AbortError')) return;
      if (e.code === 'AI_PLAN_CONSENT_REQUIRED') setData((d) => ({ ...d, ai: { ...d.ai, plan_enabled: false } }));
      setAiMsg(e.message || 'ขอคำแนะนำจาก AI ไม่สำเร็จ');
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (alive.current && !ctrl.signal.aborted) setAiBusy(false);
    }
  };
  const cancelAdvice = () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setAiBusy(false);
  };
  // เปลี่ยนเดือนที่ดู: ยกเลิกคำขอ AI ที่ค้างอยู่ (เป็นของเดือนปัจจุบัน) แล้วโหลดเดือนที่เลือก
  const pickMonth = (m) => {
    if (abortRef.current) cancelAdvice();
    selRef.current = m === curMonth ? null : m;
    setData(null);
    setAiMsg('');
    setAiDropped(0);
    setConfirmDel(null);
    setGoalModal(null);
    setShowConsent(false);
    load();
  };
  const askAi = () => {
    if (!data.ai.plan_enabled) setShowConsent(true);
    else runAdvice();
  };

  const rate = async (index, value) => {
    const cur = data.ai_advice.items[index].rating || 0;
    const next = cur === value ? 0 : value;
    setData((d) => ({ ...d, ai_advice: { ...d.ai_advice, items: d.ai_advice.items.map((it, i) => (i === index ? { ...it, rating: next } : it)) } }));
    try {
      await api.planAdviceFeedback({ month: data.month, index, rating: next });
    } catch {
      setData((d) => ({ ...d, ai_advice: { ...d.ai_advice, items: d.ai_advice.items.map((it, i) => (i === index ? { ...it, rating: cur } : it)) } }));
    }
  };
  const dropAdvice = async () => {
    try {
      await api.deletePlanAdvice(data.month);
      setData((d) => ({ ...d, ai_advice: null }));
      setAiMsg('');
    } catch (e) {
      setAiMsg(e.message || 'ลบไม่สำเร็จ');
    }
  };
  const delGoal = async (id) => {
    try {
      await api.deleteGoal(id);
      setConfirmDel(null);
      await load();
    } catch (e) {
      setError(e.message || 'ลบเป้าหมายไม่สำเร็จ');
    }
  };

  // ตัวเลือกเดือน: แยก "เดือน" กับ "ปี พ.ศ." เหมือนส่วนอื่นของแอป (ย้อนหลังได้ 24 เดือนรวมเดือนนี้)
  const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  let monthPicker = null;
  if (curMonth) {
    const range = monthOptions(curMonth, 24).map((o) => o.value); // ใหม่ → เก่า
    const sel = selRef.current || curMonth;
    const [selY, selM] = sel.split('-').map(Number);
    const curY = Number(curMonth.slice(0, 4));
    const years = [...new Set(range.map((v) => Number(v.slice(0, 4))))]; // ปีใหม่ → เก่า
    const monthsOf = (y) => range.filter((v) => Number(v.slice(0, 4)) === y).map((v) => Number(v.slice(5))).sort((x, z) => x - z);
    const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    // เปลี่ยนปี: ใช้เดือนเดิมถ้ามีในปีนั้น ไม่มีใช้เดือนที่ใกล้ที่สุด
    const pickYear = (y) => {
      const ms = monthsOf(y);
      const m = ms.includes(selM) ? selM : ms.reduce((best, x) => (Math.abs(x - selM) < Math.abs(best - selM) ? x : best), ms[0]);
      pickMonth(ym(y, m));
    };
    monthPicker = (
      <div className="pl-month">
        <span>ดูเดือน</span>
        <div className="pl-month-m">
          <MonthPicker
            options={monthsOf(selY).map((m) => ({ value: m, label: MONTH_TH[m - 1] }))}
            value={selM}
            currentValue={selY === curY ? Number(curMonth.slice(5)) : null}
            onChange={(m) => pickMonth(ym(selY, Number(m)))}
            ariaLabel="เลือกเดือนที่ดู"
          />
        </div>
        <div className="pl-month-y">
          <MonthPicker
            options={years.map((y) => ({ value: y, label: String(y + 543) }))}
            value={selY}
            currentValue={null}
            onChange={(y) => pickYear(Number(y))}
            ariaLabel="เลือกปีที่ดู (พ.ศ.)"
          />
        </div>
      </div>
    );
  }

  // แถบแท็บอยู่บนสุดของหน้า (แสดงทุกสถานะ: กำลังโหลด / ผิดพลาด / ปกติ)
  const tabBar = (
      <div className="pl-tabs" role="tablist" aria-label="ส่วนของหน้าวางแผน" data-plan-tabs>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`pl-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`pl-panel-${t.id}`}
            className={`pl-tab${tab === t.id ? ' active' : ''}`}
            data-plan-tab={t.id}
            onClick={() => pickTab(t.id)}
          >
            {t.label}
            {t.id === 'goals' && data && data.goals.length > 0 && <span className="pl-tab-count">{data.goals.length}</span>}
            {t.id === 'installments' && inst && inst.plans.length > 0 && <span className="pl-tab-count">{inst.plans.length}</span>}
          </button>
        ))}
      </div>
  );

  // หัวหน้าเดียวกันทุกสถานะ (กำลังโหลด / ผิดพลาด / ปกติ) ตำแหน่งเดิม ช่องเลือกเดือนจึงไม่ถูกสร้างใหม่ ถ้าผู้ใช้เปิดกล่องเลือกเดือนค้างไว้ระหว่างรอ กล่องจะไม่ปิดเองตอนข้อมูลโหลดเสร็จ
  const headRow = (
    <div className="pl-head">
      <div className="pl-head-row">
        {tab === 'goals' ? (
          data ? (
            <InfoTitle as="h2" title="เป้าหมายการออม" label="คำอธิบายหน้านี้" popId="pl-info-goals">
              <p>ระบบเทียบ “ที่ต้องออมต่อเดือนให้ทันกำหนด” กับ “เงินเหลือเฉลี่ยต่อเดือน” (รายรับลบรายจ่ายของเดือนเต็มก่อนหน้า) ซึ่งเป็นเงินที่เหลือให้แบ่งมาออมได้ ไม่ใช่ยอดที่ออมไปแล้ว ยอด “ออมแล้ว” ตอนนี้กรอกเอง (กดแก้ไขเมื่อออมเพิ่ม) เป้าหมายแสดงสถานะ ณ ปัจจุบันเสมอ ไม่ขึ้นกับเดือนที่ดู ตั้งได้สูงสุด {data.max_goals} เป้าหมาย</p>
            </InfoTitle>
          ) : <h2>เป้าหมายการออม</h2>
        ) : tab === 'installments' ? (
          <InfoTitle as="h2" title="รายการผ่อน" label="คำอธิบายหน้านี้" popId="pl-info-inst">
            <p>บันทึกการผ่อนสินค้า (SPayLater, บัตรเครดิต, ผ่อนกับร้านค้า ฯลฯ) ระบบรวมงวดที่ครบกำหนดวันเดียวกันของช่องทางเดียวกันเป็นบิลเดียว กด “จ่ายแล้ว” เมื่อจ่ายจริง ระบบจะบันทึกรายจ่ายตามหมวดของแต่ละชิ้นให้ งวดที่ยังไม่จ่ายของเดือนนี้ถูกกันไว้ในงบ (“ใช้ได้อีก” บนแดชบอร์ด) อัตโนมัติ</p>
          </InfoTitle>
        ) : data ? (
          <InfoTitle as="h2" title="วางแผนการเงิน" label="คำอธิบายหน้านี้" popId="pl-info-head">
            <p>วิเคราะห์จากรายการของคุณใน{thaiMonth(data.month)}{data.is_current === false ? ' (เดือนที่ผ่านมา)' : ''} ตัวเลขทั้งหมดคำนวณโดยระบบ (ไม่ได้ให้ AI คิดเลข)</p>
          </InfoTitle>
        ) : <h2>วางแผนการเงิน</h2>}
        {tab === 'overview' && monthPicker}
        {tab === 'installments' && inst && (
          <div className="pl-seg pl-seg-head" role="group" aria-label="เลือกดูรายการผ่อน" data-inst-seg>
            <button type="button" className={instView === 'active' ? 'on' : ''} aria-pressed={instView === 'active'} data-inst-seg-active onClick={() => setInstView('active')}>
              กำลังผ่อน <span className="pl-seg-n">{inst.plans.length}</span>
            </button>
            <button type="button" className={instView === 'done' ? 'on' : ''} aria-pressed={instView === 'done'} data-inst-seg-done onClick={() => setInstView('done')}>
              ✓ ผ่อนเสร็จแล้ว <span className="pl-seg-n">{inst.done.length}</span>
            </button>
          </div>
        )}
        {tab === 'installments' && inst && (
          <button
            type="button"
            className="pl-add-btn"
            data-inst-add
            disabled={inst.plans.length >= inst.max_active}
            title={inst.plans.length >= inst.max_active ? `มีรายการที่กำลังผ่อนได้สูงสุด ${inst.max_active} รายการ` : ''}
            onClick={() => { setInstView('active'); setInstAdd((n) => n + 1); }}
          >
            <span className="pl-add-full">+ เพิ่มรายการผ่อน</span><span className="pl-add-short" aria-hidden="true">+ เพิ่ม</span>
          </button>
        )}
        {/* แท็บเป้าหมายออม: ปุ่มสลับ "กำลังออม / สำเร็จแล้ว" อยู่บรรทัดเดียวกับหัวข้อ (มือถือลงไปใต้หัวข้อ) */}
        {tab === 'goals' && data && (
            <div className="pl-seg pl-seg-head" role="group" aria-label="เลือกดูเป้าหมาย" data-goal-seg>
              <button type="button" className={goalView === 'active' ? 'on' : ''} aria-pressed={goalView === 'active'} data-goal-seg-active onClick={() => setGoalView('active')}>
                กำลังออม <span className="pl-seg-n">{data.goals.length}</span>
              </button>
              <button type="button" className={goalView === 'done' ? 'on' : ''} aria-pressed={goalView === 'done'} data-goal-seg-done onClick={() => setGoalView('done')}>
                <span aria-hidden="true">🏆</span> สำเร็จแล้ว <span className="pl-seg-n gold">{(data.achievements || []).length}</span>
              </button>
            </div>
        )}
        {tab === 'goals' && data && (
          <button
            type="button"
            className="pl-add-btn"
            data-goal-add
            disabled={data.goals.length >= data.max_goals}
            title={data.goals.length >= data.max_goals ? `ตั้งได้สูงสุด ${data.max_goals} เป้าหมาย` : `ตั้งได้อีก ${data.max_goals - data.goals.length} เป้า`}
            onClick={() => { setGoalView('active'); setGoalModal({ goal: null }); }}
          >
            <span className="pl-add-full">+ เพิ่มเป้าหมาย</span><span className="pl-add-short" aria-hidden="true">+ เพิ่ม</span>
          </button>
        )}
      </div>
    </div>
  );

  if (error && !data) {
    return (
      <div className="pl-page" data-plan-error>
        <style>{css}</style>
        {tabBar}
        {headRow}
        <div className="card"><p>{error}</p><button type="button" className="btn" onClick={load}>ลองใหม่</button></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pl-page" data-plan-loading>
        <style>{css}</style>
        {tabBar}
        {headRow}
        <p>กำลังโหลดการวิเคราะห์...</p>
      </div>
    );
  }

  const an = data.analysis;
  const ai = data.ai;
  const saved = data.ai_advice;
  const top = an.anomalies[0];
  const pctBase = an.daily.pct_vs_base;
  const peakDay = an.weekday.by_day.reduce((a, d) => (d.amount > a.amount ? d : a), an.weekday.by_day[0]);
  const maxDay = Math.max(1, ...an.weekday.by_day.map((d) => d.amount));
  const proj = an.projection;
  const catRows = an.categories.slice(0, 8);
  const isCur = data.is_current !== false; // false = กำลังดูเดือนที่ผ่านมา (ดูอย่างเดียว)

  // รายการคำแนะนำรวม: ของ AI ก่อน แล้วตามด้วยของระบบ (ข้ามข้อของระบบที่ใช้ตัวเลขชุดเดียวกับของ AI เพราะพูดเรื่องเดียวกัน)
  const aiItems = saved ? saved.items : [];
  const aiFactIds = new Set(aiItems.flatMap((it) => (it.facts_used || []).map((f) => f.id)));
  const sysItems = data.rules_advice.filter((it) => !(it.facts_used || []).some((f) => aiFactIds.has(f.id)));

  return (
    <div className="pl-page" data-plan-page>
      <style>{css}</style>
      {tabBar}
      {headRow}

      {tab === 'overview' && (
      <div role="tabpanel" id="pl-panel-overview" aria-labelledby="pl-tab-overview" data-plan-panel="overview">
      {!isCur && (
        <div className="pl-past" data-plan-past>
          <span>กำลังดูย้อนหลัง การวิเคราะห์และคำแนะนำดูได้อย่างเดียว ขอ AI วิเคราะห์ได้เฉพาะเดือนปัจจุบัน (เป้าหมายการออมไม่ขึ้นกับเดือนที่ดู)</span>
          <button type="button" className="pl-link" data-plan-back-current onClick={() => pickMonth(curMonth)}>กลับไปเดือนนี้</button>
        </div>
      )}

      {an.limits.length > 0 && (
        <div className="pl-limits" data-plan-limits>
          {an.limits.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}

      {/* ===== 1 พฤติกรรมการใช้จ่าย ===== */}
      <div className="card" data-plan-behavior>
        <InfoTitle title={<><span className="pl-ti"><IconChart size={18} /></span>{isCur ? 'พฤติกรรมการใช้จ่ายเดือนนี้' : `พฤติกรรมการใช้จ่าย ${thaiMonth(data.month)}`}</>} label="คำอธิบายส่วนนี้" popId="pl-info-behavior">
          <p>เทียบกับค่าเฉลี่ยของเดือนเต็มก่อนหน้า (สูงสุด 3 เดือน เฉพาะเดือนที่มีรายการ) หมวดที่ถือว่าสูงผิดปกติคือสูงกว่าที่ควรเป็นตั้งแต่ 30% และเกินอย่างน้อย 200 บาท หมวดที่จ่ายเป็นก้อน เช่น ค่าเช่า เทียบกับยอดเต็มเดือน</p>
        </InfoTitle>
        <div className="pl-metrics">
          <div className="pl-metric" data-m="daily">
            <div className="l">ใช้จ่ายเฉลี่ยต่อวัน</div>
            <div className="v">{an.daily.avg === null ? '-' : baht(an.daily.avg)}</div>
            <div className={`s${pctBase !== null && pctBase > 0 ? ' bad' : ''}`}>{pctBase === null ? 'ยังไม่มีค่าเฉลี่ยให้เทียบ' : `${pctBase > 0 ? 'สูงกว่า' : pctBase < 0 ? 'ต่ำกว่า' : 'เท่ากับ'}ค่าเฉลี่ยเดิม${pctBase === 0 ? '' : ` ${num1(Math.abs(pctBase))}%`}`}</div>
          </div>
          <div className="pl-metric" data-m="peak">
            <div className="l">วันที่ใช้จ่ายสูงสุดของสัปดาห์</div>
            <div className="v">{an.weekday.peak ? an.weekday.peak.name : '-'}</div>
            <div className="s">{an.weekday.peak ? `${num1(an.weekday.peak.share_pct)}% ของรายจ่าย 90 วัน${isCur ? 'ล่าสุด' : 'ถึงสิ้นเดือน'}` : 'ข้อมูลยังไม่พอ'}</div>
          </div>
          <div className="pl-metric" data-m="anomaly">
            <div className="l">หมวดที่สูงผิดปกติ</div>
            <div className="v">{top ? top.name : 'ไม่พบ'}</div>
            <div className={`s${top ? ' bad' : ''}`}>{top ? `${baht(top.amount)} สูงกว่าค่าเฉลี่ย ${num1(top.pct_vs_expected)}%` : an.data.has_baseline ? 'ทุกหมวดอยู่ในระดับปกติของคุณ' : 'ยังไม่มีค่าเฉลี่ยให้เทียบ'}</div>
          </div>
          <div className="pl-metric" data-m="projection">
            <div className="l">{isCur ? 'คาดการณ์รายจ่ายสิ้นเดือน' : 'รายจ่ายทั้งเดือน'}</div>
            <div className="v">{proj.expense_end === null ? '-' : baht(isCur ? proj.expense_end : an.totals.expense)}</div>
            <div className={`s${proj.over_income ? ' bad' : ''}`}>{proj.expense_end === null ? (isCur ? 'ยังคาดการณ์ไม่ได้' : 'ไม่มีรายจ่ายในเดือนนั้น') : proj.income_ref ? `เทียบรายรับอ้างอิง ${baht(proj.income_ref)} (${num1(proj.pct_of_income)}%)` : 'ยังไม่มีรายรับให้เทียบ'}</div>
          </div>
        </div>
        {an.small_purchases.flagged && (
          <p className="pl-note" data-small>รายจ่ายน้อยกว่า {an.small_purchases.threshold} บาทมี {an.small_purchases.count} ครั้งใน {an.small_purchases.days} วัน รวม {baht(an.small_purchases.total)} ({num1(an.small_purchases.share_pct)}% ของรายจ่าย)</p>
        )}
        {an.weekday.reliable && (
          <>
            <div className="pl-days" role="img" aria-label={`รายจ่ายรายวันของสัปดาห์ ${isCur ? 'ย้อนหลัง' : 'ในช่วง'} 90 วัน`} data-days>
              {an.weekday.by_day.map((d) => (
                <div key={d.day} className={`pl-day${d.day === peakDay.day ? ' peak' : ''}`}>
                  <i style={{ height: `${Math.max(2, Math.round((d.amount / maxDay) * 70))}px` }} />
                  <span>{DAY_SHORT[d.day]}</span>
                </div>
              ))}
            </div>
            <p className="pl-days-cap">สัดส่วนรายจ่ายรายวันของสัปดาห์ ({isCur ? 'ย้อนหลัง 90 วัน' : '90 วันถึงสิ้นเดือน'})</p>
          </>
        )}
        {catRows.length > 0 && (
          <details className="pl-details" data-cat-details>
            <summary>ดูรายจ่ายรายหมวดเทียบค่าเฉลี่ย</summary>
            <table className="pl-table">
              <thead><tr><th>หมวด</th><th>เดือนนี้</th><th>ค่าเฉลี่ยของคุณ</th><th>เทียบ</th></tr></thead>
              <tbody>
                {catRows.map((c) => (
                  <tr key={c.category_id} data-cat-row>
                    <td>{c.name}</td>
                    <td>{baht(c.amount)}</td>
                    <td>{c.expected_to_date === null ? '-' : baht(c.expected_to_date)}</td>
                    <td className={c.flagged ? 'flag' : ''}>{c.pct_vs_expected === null ? '-' : `${c.pct_vs_expected > 0 ? '+' : ''}${num1(c.pct_vs_expected)}%`}{c.flagged ? ' ⚠️' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="pl-grid">
        {/* ===== 2 คำแนะนำ (ของ AI และของระบบ รวมเป็นรายการเดียว) ===== */}
        <div className="card" data-plan-advice>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconSpark size={18} /></span>คำแนะนำ</>} label="คำอธิบายส่วนนี้" popId="pl-info-advice">
              <p>ป้าย “AI” คือคำแนะนำที่ AI เขียนจากตัวเลขสรุปเมื่อคุณกดขอ (ไม่ส่งรายการรายตัวหรือบันทึกช่วยจำ) ระบบตรวจตัวเลขในข้อความทุกตัวก่อนแสดง ถ้าไม่ตรงกับที่ระบบคำนวณจะไม่แสดงข้อนั้น ป้าย “ระบบ” คำนวณด้วยกฎ ใช้ได้ตลอดแม้ไม่ใช้ AI คำแนะนำเป็นแนวทางเรื่องงบประมาณและการออมเท่านั้น ไม่เกี่ยวกับการลงทุน</p>
            </InfoTitle>
            {isCur && ai.configured && !aiBusy && (
              <button type="button" className="pl-link" data-ai-ask onClick={askAi} disabled={ai.plans_used_today >= ai.plan_daily_limit}>
                <IconSpark size={14} />{saved ? 'วิเคราะห์ใหม่' : 'ให้ AI วิเคราะห์'}
              </button>
            )}
          </div>

          {aiBusy && (
            <div className="pl-busy" data-ai-busy-wrap>
              <span data-ai-busy>AI กำลังเขียนคำแนะนำ... {aiElapsed} วินาที</span>
              <button type="button" className="pl-link" data-ai-cancel onClick={cancelAdvice}>ยกเลิก</button>
            </div>
          )}
          {aiMsg && <p className="pl-msg" role="alert" data-ai-msg>{aiMsg}</p>}

          {aiItems.map((it, i) => (
            <div className="pl-item" key={`ai-${i}`} data-ai-item>
              <AdviceIcon tag={it.tag} />
              <div className="tx">
                <div>{it.text}<span className="pl-badge ai" data-badge>AI</span></div>
                <div className="pl-chips" data-chips>
                  <Chips facts={it.facts_used} />
                  <span className="pl-rate">
                    <button type="button" aria-pressed={it.rating === 1} aria-label="คำแนะนำนี้เป็นประโยชน์" data-rate-up onClick={() => rate(i, 1)}><IconThumb size={15} /></button>
                    <button type="button" aria-pressed={it.rating === -1} aria-label="คำแนะนำนี้ไม่เป็นประโยชน์" data-rate-down onClick={() => rate(i, -1)}><IconThumb size={15} down /></button>
                  </span>
                </div>
              </div>
            </div>
          ))}
          {sysItems.map((it, i) => (
            <div className="pl-item" key={`sys-${i}`} data-rule-item>
              <AdviceIcon tag={it.tag} />
              <div className="tx">
                <div>{it.text}<span className="pl-badge" data-badge>ระบบ</span></div>
                {it.facts_used && it.facts_used.length > 0 && <div className="pl-chips" data-chips><Chips facts={it.facts_used} /></div>}
              </div>
            </div>
          ))}

          {isCur && !ai.configured && <p className="pl-empty" data-ai-unavailable>ระบบนี้ยังไม่เปิดบริการ AI ดูคำแนะนำจากระบบได้</p>}
          {!isCur && !saved && <p className="pl-empty" data-ai-past-note>เดือนนั้นไม่มีคำแนะนำของ AI ที่เก็บไว้ ขอ AI วิเคราะห์ได้เฉพาะเดือนปัจจุบัน</p>}
          {saved && saved.stale && <p className="pl-stale" role="status" data-ai-stale>{isCur ? 'ข้อมูลของคุณเปลี่ยนไปหลังจาก AI เขียน ตัวเลขในคำแนะนำอาจไม่ตรงแล้ว กด “วิเคราะห์ใหม่” เพื่ออัปเดต' : 'รายการของเดือนนั้นถูกแก้ไขหลังจาก AI เขียน ตัวเลขในคำแนะนำอาจไม่ตรงแล้ว (ขอ AI ใหม่ได้เฉพาะเดือนปัจจุบัน)'}</p>}
          {saved && <p className="pl-note" data-ai-generated>AI เขียนเมื่อ {new Date(saved.generated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}{' '}<button type="button" className="pl-link" style={{ fontSize: 12 }} data-ai-delete onClick={dropAdvice}>ลบคำแนะนำของ AI</button></p>}
          {aiDropped > 0 && <p className="pl-note" data-ai-dropped>AI เสนอเพิ่มอีก {aiDropped} ข้อที่ตัวเลขไม่ตรงกับที่ระบบคำนวณ ระบบจึงไม่แสดง</p>}

          <div className="pl-foot">
            <p className="pl-note" data-disclaimer>ตัวเลขทุกตัวคำนวณจากรายการของคุณโดยระบบ AI เป็นผู้เขียนคำอธิบาย ไม่ใช่คำแนะนำทางการเงินจากผู้เชี่ยวชาญ</p>
            {isCur && ai.configured && <p className="pl-note" data-ai-usage>วันนี้ขอไปแล้ว {ai.plans_used_today}/{ai.plan_daily_limit} ครั้ง</p>}
          </div>
        </div>

        {/* ===== 3 สรุปเป้าหมายการออม (แบบย่อ) กดเพื่อไปแท็บเป้าหมายออม ===== */}
        <div className="card" data-plan-goals-summary>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconFlag size={18} /></span>เป้าหมายการออม</>} label="คำอธิบายส่วนนี้" popId="pl-info-goals-sum">
              <p>สรุปความคืบหน้าของเป้าหมาย (สถานะ ณ ปัจจุบัน ไม่ขึ้นกับเดือนที่ดู) ดูรายละเอียด แก้ไข หรือเพิ่มเป้าหมายได้ที่แท็บ “เป้าหมายออม”</p>
            </InfoTitle>
          </div>
          {data.goals.length === 0 ? (
            <>
              <p className="pl-empty">{(data.achievements || []).length > 0 ? 'ตอนนี้ไม่มีเป้าหมายที่กำลังออม ตั้งเป้าหมายใหม่ได้เลย' : 'ยังไม่มีเป้าหมาย ตั้งเป้าหมายเพื่อดูว่าต้องออมเดือนละเท่าไรและจะถึงเมื่อไร'}</p>
              <button type="button" className="pl-link" data-goal-sum-add onClick={() => { pickTab('goals'); setGoalModal({ goal: null }); }}>+ ตั้งเป้าหมาย</button>
            </>
          ) : (
            <>
              <div className="pl-gs">
                {data.goals.slice(0, 3).map((g) => {
                  const st = goalStatus(g);
                  return (
                    <div className="pl-gs-row" key={g.goal_id} data-goal-sum-item>
                      <span className="pl-gs-name">{g.name}</span>
                      <span className="pl-gs-pct">{num1(g.progress_pct)}% <span className={`pl-status ${st.cls}`}>{st.text}</span></span>
                      <div className={`pl-bar${st.cls === 'warn' ? ' warn' : ''}`} aria-hidden="true"><i style={{ width: `${g.progress_pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="pl-gs-more">
                <button type="button" className="pl-link" data-goal-sum-all onClick={() => pickTab('goals')}>
                  {data.goals.length > 3 ? `ดูทั้งหมด ${data.goals.length} เป้าหมาย →` : 'ดูรายละเอียด →'}
                </button>
              </div>
            </>
          )}
          {(data.achievements || []).length > 0 && (
            <button type="button" className="pl-ach-line" data-goal-sum-achieved onClick={() => { pickTab('goals'); setGoalView('done'); }}>
              <span aria-hidden="true">🏆</span> สำเร็จแล้ว {data.achievements.length} เป้า · {baht(data.achievements.reduce((t, a) => t + a.target_amount, 0))}
              <span className="pl-ach-go">→</span>
            </button>
          )}
        </div>

        {/* ===== 4 สรุปรายการผ่อนเดือนนี้ (แบบย่อ) กดเพื่อไปแท็บรายการผ่อน ===== */}
        {inst && (
          <div className="card" data-plan-inst-summary>
            <div className="pl-card-head">
              <InfoTitle title={<><span className="pl-ti" aria-hidden="true">💳</span>ผ่อนเดือนนี้</>} label="คำอธิบายส่วนนี้" popId="pl-info-inst-sum">
                <p>งวดผ่อนที่ครบกำหนดเดือนนี้ (รวมที่ค้างชำระ) ไม่ขึ้นกับเดือนที่ดู จัดการรายการผ่อนได้ที่แท็บ “รายการผ่อน”</p>
              </InfoTitle>
            </div>
            {inst.plans.length === 0 ? (
              <>
                <p className="pl-empty">ยังไม่มีรายการผ่อน บันทึกไว้เพื่อให้ระบบเตือนวันจ่ายและกันเงินในงบให้</p>
                <button type="button" className="pl-link" data-inst-sum-add onClick={() => { pickTab('installments'); setInstView('active'); }}>+ เพิ่มรายการผ่อน</button>
              </>
            ) : (
              <>
                <div className="pl-inst-sum">
                  <div><span>ต้องจ่ายเดือนนี้</span><b>{baht(inst.summary.due_month)}</b></div>
                  <div><span>เหลือต้องจ่าย</span><b>{baht(inst.summary.left_month)}</b></div>
                  {inst.summary.next_bill && (
                    <div><span>บิลถัดไป</span><b className={inst.summary.next_bill.overdue ? 'over' : ''}>{inst.summary.next_bill.channel_label} · {thaiDate(inst.summary.next_bill.due_date)}{inst.summary.next_bill.overdue ? ' (ค้างชำระ)' : ''}</b></div>
                  )}
                </div>
                <div className="pl-gs-more">
                  <button type="button" className="pl-link" data-inst-sum-all onClick={() => { pickTab('installments'); setInstView('active'); }}>ดูรายการผ่อน →</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
      )}

      {tab === 'goals' && (
        <div role="tabpanel" id="pl-panel-goals" aria-labelledby="pl-tab-goals" data-plan-panel="goals">
          {goalView === 'done' ? (
            (data.achievements || []).length === 0 ? (
              <div className="card pl-goal-empty" data-ach-empty>
                <span className="pl-soon-icon gold" aria-hidden="true">🏆</span>
                <p>ยังไม่มีเป้าหมายที่ออมสำเร็จ เมื่อยอด “ออมแล้ว” ถึงเป้า ระบบจะย้ายมาเก็บไว้ที่นี่ให้อัตโนมัติ</p>
              </div>
            ) : (
              <>
                <div className="pl-ach-sum" data-ach-summary>
                  <span className="pl-ach-sum-icon" aria-hidden="true">🏆</span>
                  <div>
                    <div className="pl-ach-sum-big">ออมสำเร็จแล้ว {data.achievements.length} เป้าหมาย</div>
                    <div className="pl-ach-sum-sub">รวมทั้งหมด {baht(data.achievements.reduce((t, a) => t + a.target_amount, 0))} · ล่าสุด {data.achievements[0].name} ({thaiDate(data.achievements[0].completed_at)})</div>
                  </div>
                </div>
                <div className="pl-ach-grid" data-achievements>
                  {data.achievements.map((a) => {
                    const pill = timingPill(a.early_days);
                    return (
                      <div className="pl-ach" key={a.goal_id} data-ach-item>
                        <div className="pl-ach-menu-wrap" data-ach-menu-wrap>
                          <button type="button" className="pl-ach-more" aria-label={`ตัวเลือกของ ${a.name}`} aria-expanded={achMenu === a.goal_id} data-ach-more onClick={() => setAchMenu(achMenu === a.goal_id ? null : a.goal_id)}>⋯</button>
                          {achMenu === a.goal_id && (
                            <div className="pl-ach-menu" role="menu">
                              <button type="button" role="menuitem" data-ach-reopen onClick={() => { setAchMenu(null); setGoalModal({ goal: a, reopen: true }); }}>ย้ายกลับไปกำลังออม</button>
                              <button type="button" role="menuitem" className="danger" data-ach-del onClick={() => { setAchMenu(null); setConfirmDel(a.goal_id); }}>ลบออกจากประวัติ</button>
                            </div>
                          )}
                        </div>
                        <span className="pl-ach-trophy" aria-hidden="true">🏆</span>
                        <div className="pl-ach-name">{a.name}</div>
                        <div className="pl-ach-amt">{baht(a.target_amount)}</div>
                        <div className="pl-ach-meta">
                          สำเร็จ {thaiDate(a.completed_at)}
                          <br />
                          {durationText(a.duration_days)} <span className={`pl-ach-pill ${pill.cls}`} data-ach-timing>{pill.text}</span>
                        </div>
                        {confirmDel === a.goal_id && (
                          <div className="pl-confirm" data-goal-confirm>
                            <span>ลบออกจากประวัติ?</span>
                            <button type="button" className="btn btn-sm btn-danger" data-goal-del-yes onClick={() => delGoal(a.goal_id)}>ลบ</button>
                            <button type="button" className="btn btn-sm btn-light" data-goal-del-no onClick={() => setConfirmDel(null)}>ยกเลิก</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )
          ) : data.goals.length === 0 ? (
            <div className="card pl-goal-empty" data-plan-goals>
              <span className="pl-soon-icon" aria-hidden="true"><IconFlag size={24} /></span>
              <p data-goals-empty>{(data.achievements || []).length > 0 ? 'ตอนนี้ไม่มีเป้าหมายที่กำลังออม ตั้งเป้าหมายใหม่ต่อได้เลย' : 'ยังไม่มีเป้าหมาย ตั้งเป้าหมายเพื่อดูว่าต้องออมเดือนละเท่าไรและจะถึงเมื่อไร'}</p>
              <button type="button" className="pl-add" onClick={() => setGoalModal({ goal: null })}>{(data.achievements || []).length > 0 ? '+ ตั้งเป้าหมายใหม่' : '+ ตั้งเป้าหมายแรก'}</button>
            </div>
          ) : (
            <div className="pl-goal-grid" data-plan-goals>
              {data.goals.map((g) => {
                const st = goalStatus(g);
                const more = g.status === 'reached' ? null : goalLine(g).text;
                const hasNum = (v) => v !== null && v !== undefined;
                return (
                  <div className="card pl-goal" key={g.goal_id} data-goal-item>
                    <div className="pl-goal-top">
                      <span className="pl-goal-name">{g.name}</span>
                      <span className="pl-goal-tools">
                        <button type="button" aria-label={`แก้ไขเป้าหมาย ${g.name}`} title="แก้ไข" data-goal-edit onClick={() => setGoalModal({ goal: g })}><IconEdit size={15} /></button>
                        <button type="button" aria-label={`ลบเป้าหมาย ${g.name}`} title="ลบ" data-goal-del onClick={() => setConfirmDel(g.goal_id)}><IconTrash size={15} /></button>
                      </span>
                    </div>
                    <div className="pl-goal-meta">เป้า {baht(g.target_amount)} · ภายใน {thaiMonthYearShort(g.target_date)}</div>
                    <div className="pl-goal-pct">
                      <b>{num1(g.progress_pct)}%</b>
                      <span className={`pl-status ${st.cls}`} data-goal-status>{st.text}</span>
                    </div>
                    <div className={`pl-bar${st.cls === 'warn' ? ' warn' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.progress_pct} aria-label={`ความคืบหน้า ${g.name}`}><i style={{ width: `${g.progress_pct}%` }} /></div>
                    <dl className="pl-goal-facts" data-goal-line>
                      <div><dt>ออมแล้ว</dt><dd>{baht(g.saved_amount)}</dd></div>
                      {g.status !== 'reached' && hasNum(g.required_monthly) && <div><dt>ต้องออมเดือนละ</dt><dd>{baht(g.required_monthly)}</dd></div>}
                      {g.status !== 'reached' && hasNum(g.capacity_monthly) && <div><dt>เงินเหลือเฉลี่ยเดือนละ</dt><dd>{baht(g.capacity_monthly)}</dd></div>}
                    </dl>
                    {more && (
                      <details className="pl-goal-more" data-goal-more>
                        <summary>รายละเอียด</summary>
                        <p>{more} (กำหนด {thaiDate(g.target_date)})</p>
                      </details>
                    )}
                    {confirmDel === g.goal_id && (
                      <div className="pl-confirm" data-goal-confirm>
                        <span>ลบเป้าหมายนี้?</span>
                        <button type="button" className="btn btn-sm btn-danger" data-goal-del-yes onClick={() => delGoal(g.goal_id)}>ลบ</button>
                        <button type="button" className="btn btn-sm btn-light" data-goal-del-no onClick={() => setConfirmDel(null)}>ยกเลิก</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {error && data && <p className="pl-msg" role="alert">{error}</p>}
        </div>
      )}

      {tab === 'installments' && (
        <div role="tabpanel" id="pl-panel-installments" aria-labelledby="pl-tab-installments" data-plan-panel="installments">
          <InstallmentsPanel
            inst={inst}
            view={instView}
            categories={cats}
            onCategoryCreated={(c) => setCats((prev) => (prev.some((x) => String(x.category_id) === String(c.category_id)) ? prev : [...prev, c]))}
            onData={(d) => setInst(d)}
            onReload={loadInst}
            addSignal={instAdd}
          />
        </div>
      )}

      {goalModal && (
        <GoalModal
          goal={goalModal.goal}
          reopen={!!goalModal.reopen}
          onClose={() => setGoalModal(null)}
          onSaved={async (goal, res) => {
            const wasReopen = !!goalModal.reopen;
            setGoalModal(null);
            await load();
            if (res && res.just_completed && res.achievement) setCelebrate(res.achievement);
            if (wasReopen) setGoalView('active');
          }}
        />
      )}
      {celebrate && (
        <div className="pl-cele-bg" data-celebrate onClick={() => setCelebrate(null)}>
          <div className="pl-cele" role="dialog" aria-modal="true" aria-labelledby="pl-cele-title" onClick={(e) => e.stopPropagation()}>
            <div className="pl-cele-em" aria-hidden="true">🎉</div>
            <h3 id="pl-cele-title">ออมครบแล้ว!</h3>
            <p className="pl-cele-name">{celebrate.name}</p>
            <div className="pl-cele-amt">{baht(celebrate.target_amount)}</div>
            <p>{durationText(celebrate.duration_days)} · {timingPill(celebrate.early_days).text}</p>
            <p>ย้ายไปที่ “สำเร็จแล้ว” ให้แล้ว</p>
            <button type="button" className="pl-cele-ok" data-celebrate-ok autoFocus onClick={() => { setCelebrate(null); setGoalView('done'); }}>เยี่ยม!</button>
            <div>
              <button type="button" className="pl-cele-undo" data-celebrate-undo onClick={() => { const a = celebrate; setCelebrate(null); setGoalModal({ goal: a, reopen: true }); }}>กรอกยอดผิด ยังไม่ครบ (ย้ายกลับ)</button>
            </div>
          </div>
        </div>
      )}
      {showConsent && (
        <AiConsentModal
          scope="plan"
          version={ai.plan_consent_version}
          onAccepted={() => { setShowConsent(false); setData((d) => ({ ...d, ai: { ...d.ai, plan_enabled: true } })); runAdvice(); }}
          onDeclined={() => setShowConsent(false)}
        />
      )}
    </div>
  );
}
