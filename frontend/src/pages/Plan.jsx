import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import InfoTitle from '../components/InfoTitle.jsx';
import GoalModal from '../components/GoalModal.jsx';
import MonthPicker from '../components/MonthPicker.jsx';
import AiConsentModal from '../components/AiConsentModal.jsx';
import InstallmentsPanel from '../components/InstallmentsPanel.jsx';
import { IconSpark, IconFlag, IconChart, IconEdit, IconTrash, IconThumb, IconWarning, IconPiggy, IconSprout, IconTrophy, IconParty, IconCheckCircle, AdviceIcon } from '../components/PlanIcons.jsx';
import { baht, num1, thaiDate, thaiMonth, thaiMonthYearShort, chipParts, monthOptions, timesOf, pctOrTimes } from '../utils/planFormat.js';

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
.pl-tab-dot { width: 8px; height: 8px; border-radius: 50%; background: #C2410C; }
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
.pl-goal-pct b { font-size: 18px; color: #3F3A34; }
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
.pl-ach-total { margin: 0 0 10px; font-size: 13px; color: #8A8177; }
.pl-ach-total b { color: #5F5A52; font-weight: 600; }
.pl-goal-grid > .pl-ach { position: relative; display: flex; flex-direction: column; padding: 16px 18px; border-color: #EFE2C2; background: #FFFCF4; }
.pl-ach-name { padding-right: 30px; font-size: 16px; font-weight: 700; color: #3F3A34; overflow-wrap: anywhere; }
.pl-ach-sub { margin-top: 2px; font-size: 12px; color: #6b7280; }
.pl-ach-pct { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.pl-ach-done { display: inline-flex; align-items: center; gap: 8px; }
.pl-ach-done b { font-size: 18px; color: #8A6A1F; font-variant-numeric: tabular-nums; }
.pl-ach-trophy { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; background: #F7EBCB; color: #A9812C; }
.pl-ach-bar { margin: 6px 0 10px; }
.pl-bar.pl-ach-bar { height: 4px; }
.pl-bar.pl-ach-bar i { display: block; height: 100%; border-radius: 4px; background: #D9B45E; }
.pl-ach-facts { gap: 6px; }
.pl-ach-facts dt { color: #9A9185; }
.pl-ach-facts dd { font-weight: 500; color: #5F5A52; }
.pl-ach-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
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
.pl-soon-icon.gold { background: #F7EBCB; color: #A9812C; font-size: 24px; }
.pl-cele-bg { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(40,35,25,0.4); }
.pl-cele { width: 100%; max-width: 360px; padding: 26px 22px 18px; border-radius: 18px; background: #fff; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.25); animation: pl-pop 0.25s ease-out; }
@keyframes pl-pop { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pl-cele { animation: none; } }
.pl-cele-em { font-size: 40px; line-height: 1.2; color: #A9812C; }
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
/* ===== ภาพรวม: การ์ดสรุป 4 ใบ ===== */
.pl-hero { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.pl-hero-c { min-width: 0; padding: 12px 14px; border: 1px solid #ECE6DA; border-left: 4px solid #9AAB91; border-radius: 12px; background: #fff; text-align: left; font: inherit; color: inherit; }
.pl-hero-c.warn { border-left-color: #E2A27E; }
.pl-hero-c .l { font-size: 12px; color: #6b7280; }
.pl-hero-c .v { margin: 2px 0; font-size: 21px; font-weight: 700; color: #3F3A34; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-hero-c.warn .v { color: #B45A2A; }
.pl-hero-c .s { font-size: 12px; line-height: 1.5; color: #6b7280; }
.pl-trend { display: inline-block; max-width: 100%; margin-top: 3px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pl-trend.g { background: #E4F2E6; color: #166534; }
.pl-trend.o { background: #FBEBDD; color: #A2522A; }
.pl-hero-c .x.warn { color: #B45A2A; }
.pl-hero-c .x { margin-top: 1px; font-size: 11px; line-height: 1.4; color: #A39A8C; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-hero-tip { position: relative; cursor: pointer; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.pl-hero-tip:hover, .pl-hero-tip.open { box-shadow: 0 2px 10px rgba(60,50,30,0.08); }
.pl-hero-tip:focus-visible { box-shadow: 0 0 0 2px #9AAB91; }
.pl-hero-more { position: absolute; top: 9px; right: 10px; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: 1px solid #D6CFC2; border-radius: 50%; font-size: 10px; font-style: italic; font-weight: 700; font-family: Georgia, serif; color: #A39A8C; }
.pl-hero-tip.open .pl-hero-more, .pl-hero-tip:hover .pl-hero-more { border-color: #9AAB91; color: #5E7558; }
.pl-hero-pop { position: absolute; left: -1px; right: -1px; top: calc(100% + 6px); z-index: 30; display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px; background: #fff; border: 1px solid #E6E0D4; box-shadow: 0 10px 28px rgba(60,50,30,0.16); cursor: default; animation: pl-pop-in 0.15s ease-out; }
@keyframes pl-pop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .pl-hero-pop { animation: none; } }
.pl-hero-pop .t { font-size: 12.5px; color: #3F3A34; }
.pl-hero-pop .r { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: #6b6358; }
.pl-hero-pop .r b { color: #3F3A34; white-space: nowrap; }
.pl-hero-pop .r small { color: #9a9184; }
.pl-dot { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; vertical-align: 1px; }
.pl-dot.ok { background: #8FB386; } .pl-dot.wait { background: #D6CFC2; } .pl-dot.late { background: #E2A27E; }
.pl-dot-lg { display: flex; gap: 12px; margin: 2px 0 0; font-size: 11px; color: #9a9184; }
.pl-hero-pop .r.fx span { display: flex; flex-direction: column; min-width: 0; }
.pl-hero-pop .r.fx small { font-size: 11px; }
.pl-hero-pop small.ok { color: #5E8A58; } .pl-hero-pop small.wait { color: #9a9184; } .pl-hero-pop small.late { color: #B45A2A; }
.pl-hero-pop .r.sum { padding-top: 4px; border-top: 1px solid #F0EBE0; }
.pl-hero-pop .up { color: #B45A2A; } .pl-hero-pop .down { color: #3D6B3A; }
.pl-hero-pop .n { margin: 2px 0 0; font-size: 11.5px; line-height: 1.5; color: #8A8177; }
.pl-hero-pop .pl-cap { justify-self: start; margin-top: 4px; }
@media (max-width: 860px) { .pl-hero > :nth-child(2n) .pl-hero-pop { left: auto; right: -1px; width: min(300px, calc(100vw - 32px)); } .pl-hero > :nth-child(2n+1) .pl-hero-pop { width: min(300px, calc(100vw - 32px)); right: auto; } }
.pl-hero-btn { position: relative; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; width: 100%; margin: 0; line-height: inherit; text-align: left; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
.pl-hero-btn .go { position: absolute; top: 10px; right: 12px; color: #B5AC9E; transition: transform 0.2s, color 0.2s; }
.pl-hero-btn:hover .go { color: #5E7558; transform: translateX(2px); }
.pl-hero-btn:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-color: #D9D2C3; }
.pl-hero-btn:focus-visible { outline: 2px solid #9AAB91; outline-offset: 2px; }
@media (max-width: 860px) { .pl-hero { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
@media (max-width: 400px) { .pl-hero-c { padding: 10px 11px; } .pl-hero-c .v { font-size: 18px; } }
/* ===== การ์ดพฤติกรรม (ซ่อนได้) ===== */
.pl-page > .card.pl-beh { padding-bottom: 16px; }
.pl-page > .card.pl-beh.closed { padding-top: 12px; padding-bottom: 12px; }
.pl-beh-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pl-collapse { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 5px 10px 5px 12px; border: 1px solid #E2DCCF; border-radius: 999px; background: #fff; font: inherit; font-size: 12.5px; color: #6b6358; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
.pl-collapse:hover { background: #F5F2EA; border-color: #D3CCBE; }
.pl-collapse:focus-visible { outline: 2px solid #9AAB91; outline-offset: 1px; }
.pl-chev { transform: rotate(180deg); transition: transform 0.25s; }
.pl-beh.closed .pl-chev { transform: rotate(0deg); }
.pl-beh-wrap { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.3s ease; }
.pl-beh.closed .pl-beh-wrap { grid-template-rows: 0fr; }
.pl-beh-inner { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .pl-beh-wrap, .pl-chev { transition: none; } }
.pl-beh-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px 28px; padding-top: 12px; }
@media (max-width: 820px) { .pl-beh-grid { grid-template-columns: minmax(0, 1fr); } }
.pl-beh-sub { display: flex; align-items: baseline; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; font-size: 13px; font-weight: 600; color: #4B4740; }
.pl-beh-sub span { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 400; color: #8A8177; }
.pl-lg-bar { display: inline-block; width: 12px; height: 8px; border-radius: 2px; background: #B9C8B2; }
.pl-lg-mark { display: inline-block; width: 2px; height: 12px; margin-left: 6px; border-radius: 1px; background: #5b5348; }
.pl-beh .pl-days { margin-top: 10px; }
.pl-wd { margin-top: 12px; }
.pl-wd-area { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; align-items: end; height: 138px; padding-top: 26px; box-sizing: border-box; border-bottom: 1px solid #E6E0D4; }
.pl-wd-grid { position: absolute; left: 0; right: 0; border-top: 1px solid #F1EDE4; pointer-events: none; }
.pl-wd-avg { position: absolute; left: 0; right: 0; border-top: 1.5px dashed #BDB4A6; pointer-events: none; z-index: 1; }
.pl-wd-bar { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; padding: 0; border: none; background: none; cursor: pointer; z-index: 2; }
.pl-wd-bar i { display: block; width: 100%; max-width: 34px; border-radius: 7px 7px 2px 2px; background: #CBD8C4; transition: background 0.2s, opacity 0.2s, transform 0.2s; transform-origin: bottom; }
.pl-wd-bar.today i { background: #7E9677; }
.pl-wd-bar em { position: absolute; left: -20px; right: -20px; text-align: center; white-space: nowrap; font-style: normal; font-size: 11px; font-weight: 700; color: #5E7558; }
.pl-wd-bar:hover i, .pl-wd-bar.on i { background: #A9BDA1; }
.pl-wd-bar.today:hover i, .pl-wd-bar.today.on i { background: #6B8364; }
.pl-wd.has-act .pl-wd-bar:not(.on) i { opacity: 0.45; }
.pl-wd-bar:focus-visible { outline: none; }
.pl-wd-bar:focus-visible i { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #9AAB91; }
.pl-wd-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; margin-top: 5px; font-size: 11.5px; color: #8A8177; text-align: center; }
.pl-wd-days .today { font-weight: 700; color: #40563C; }
/* ป้าย "สูงสุด" เหนือแท่งของวันที่ใช้มากที่สุด (แยกจากแท่งเข้ม = วันนี้) */
.pl-wd-bar em.pl-wd-peak { left: 50%; right: auto; transform: translateX(-50%); padding: 0 7px; border-radius: 999px; background: #F6EBD9; color: #8A6A1F; font-size: 10.5px; line-height: 1.7; }
.pl-wd-tip { position: absolute; top: -6px; z-index: 5; display: grid; gap: 1px; min-width: 132px; padding: 8px 11px; border-radius: 10px; background: #fff; border: 1px solid #E6E0D4; box-shadow: 0 6px 18px rgba(60,50,30,0.12); font-size: 12px; line-height: 1.5; color: #4B4740; transform: translateX(-50%); pointer-events: none; white-space: nowrap; }
.pl-wd-tip.l { transform: translateX(-20%); } .pl-wd-tip.r { transform: translateX(-80%); }
.pl-wd-tip b { font-size: 12.5px; color: #3F3A34; }
.pl-wd-tip small { color: #9a9184; }
.pl-special { margin-top: 12px; padding: 8px 12px; border-radius: 10px; background: #FBF6EC; border: 1px solid #EFE3CB; }
.pl-special-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12px; font-weight: 700; color: #8A6A1F; }
.pl-special-h span { cursor: help; }
.pl-special-h b { font-size: 13px; color: #5C4615; }
.pl-special ul { display: grid; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
.pl-special li { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 13px; color: #4B4740; }
.pl-special li .d { color: #8A8177; white-space: nowrap; }
.pl-special li .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-special li .n small { color: #9a9184; }
.pl-special li .a { font-weight: 600; white-space: nowrap; }
.pl-special-note { margin: 6px 0 0; font-size: 11px; line-height: 1.5; color: #A39A8C; }
.pl-wd-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 0 0; font-size: 11.5px; color: #8A8177; }
.pl-wd-legend > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.pl-wd-legend i { font-style: normal; }
.pl-wd-legend .pl-lg-peak { margin: 0; }
.pl-wd-legend .pl-lg-pk { margin: 0; }
.pl-lg-dash { display: inline-block; width: 16px; border-top: 1.5px dashed #BDB4A6; }
.pl-prog { position: relative; display: inline-flex; align-items: center; flex: none; width: 150px; height: 18px; border-radius: 999px; background: #EFEBE3; overflow: hidden; }
.pl-prog i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: #C9D6C2; }
.pl-prog em { position: relative; width: 100%; font-style: normal; font-size: 11px; font-weight: 600; color: #5E7558; text-align: center; }
.pl-learn { margin: 0 0 14px; padding: 12px 16px; border-radius: 14px; background: #F4F7F1; border: 1px solid #DCE6D5; }
.pl-learn-h { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #40563C; }
.pl-learn-h svg { color: var(--primary-dark, #74896F); }
.pl-learn ul { display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.pl-learn li { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #4B4740; }
.pl-learn li .ck { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #C9D6C2; font-size: 11px; color: #fff; }
.pl-learn li.done .ck { background: #7E9677; border-color: #7E9677; }
.pl-learn li.done .tx { color: #6b7280; }
.pl-learn li .tx { flex: 1; min-width: 0; }
.pl-learn-date { flex: none; font-size: 12px; font-weight: 600; color: #5E7558; }
@media (max-width: 560px) { .pl-learn li { flex-wrap: wrap; } .pl-learn li .pl-prog, .pl-learn li .pl-learn-date { margin-left: 28px; } }
.pl-wait { display: grid; gap: 8px; justify-items: start; margin-top: 12px; padding: 14px; border-radius: 12px; background: #F8F6F0; }
.pl-wait p { margin: 0; font-size: 13px; line-height: 1.6; color: #6b6358; }
.pl-welcome { max-width: 720px; margin: 8px auto 14px; padding: 28px 28px 22px; text-align: center; }
.pl-welcome-ic { font-size: 34px; line-height: 1; color: var(--primary-dark, #74896F); }
.pl-welcome h3 { margin: 8px 0 4px; font-size: 20px; color: #3F3A34; }
.pl-welcome-sub { margin: 0 auto; max-width: 480px; font-size: 13.5px; line-height: 1.6; color: #6b7280; }
.pl-steps { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; text-align: left; }
.pl-steps li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px solid #ECE6DA; }
.pl-steps li .n { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #EEF1EA; color: #5E7558; font-weight: 700; font-size: 13px; }
.pl-steps li.done .n { background: #7E9677; color: #fff; }
.pl-steps li .t { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.pl-steps li .t b { font-size: 14px; color: #3F3A34; }
.pl-steps li .t small { font-size: 12px; color: #8A8177; }
.pl-steps li.done .t b { color: #6b7280; text-decoration: line-through; text-decoration-color: #C9D4C2; }
.pl-steps .pl-act { flex: none; }
.pl-welcome-note { margin: 14px 0 0; font-size: 11.5px; line-height: 1.6; color: #A39A8C; }
@media (max-width: 480px) { .pl-welcome { padding: 22px 16px 18px; } .pl-steps li { flex-wrap: wrap; } .pl-steps li .t { flex-basis: calc(100% - 40px); } .pl-steps .pl-act { margin-left: 40px; } }
.pl-lg-pk { display: inline-block; margin-right: 3px; padding: 0 6px; border-radius: 999px; background: #F6EBD9; color: #8A6A1F; font-size: 10.5px; font-weight: 700; line-height: 1.6; }
.pl-lg-peak { display: inline-block; width: 9px; height: 9px; margin-right: 4px; border-radius: 2px; background: #7E9677; vertical-align: -1px; }
.pl-wd-tip .p { color: #5E7558; font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .pl-wd-bar i { transition: none; } }
@media (max-width: 480px) { .pl-wd-area, .pl-wd-days { gap: 5px; } .pl-wd-pk { display: none; } }
.pl-cbars { display: grid; gap: 9px; margin-top: 12px; }
.pl-cbar { display: grid; grid-template-columns: minmax(64px, 104px) minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: 13px; }
.pl-cbar .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3F3A34; }
.pl-cbar .nm small { font-size: 10.5px; color: #9a9184; }
.pl-cbar .tr { position: relative; height: 10px; border-radius: 5px; background: #F1EDE4; }
.pl-cbar .tr i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; background: #B9C8B2; }
.pl-cbar.flag .tr i { background: #E8B596; }
.pl-cbar .tr b { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px; background: #5b5348; }
.pl-cbar .am { min-width: 108px; text-align: right; white-space: nowrap; font-weight: 600; color: #3F3A34; }
.pl-cbar .am em { display: inline-block; min-width: 46px; margin-left: 6px; font-style: normal; font-size: 11.5px; font-weight: 500; color: #8A8177; }
.pl-cbar.flag .am em { color: #B45A2A; font-weight: 700; }
@media (max-width: 480px) { .pl-cbar { grid-template-columns: 72px minmax(0, 1fr) auto; gap: 8px; } .pl-cbar .am { min-width: 0; } .pl-cbar .am em { min-width: 0; } }
/* ===== สิ่งที่ควรทำ ===== */
.pl-side { display: grid; gap: 14px; }
.pl-cap { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 999px; background: #fff; border: 1px solid #C9D4C2; font: inherit; font-size: 12.5px; font-weight: 500; color: #5E7558; cursor: pointer; white-space: nowrap; transition: border-color 0.2s, color 0.2s, box-shadow 0.2s; }
.pl-cap svg { transition: transform 0.2s ease; }
.pl-cap:hover { border-color: #9AAB91; color: #4F6B47; box-shadow: 0 1px 3px rgba(79,107,71,0.12); }
.pl-cap:hover svg { transform: translateX(2px); }
.pl-cap:focus-visible { outline: 2px solid #9AAB91; outline-offset: 1px; }
@media (prefers-reduced-motion: reduce) { .pl-cap svg { transition: none; } }
.pl-card-head:has(.pl-cap) { flex-wrap: nowrap; }
/* แยกส่วน AI / ระบบ */
.pl-sec-h { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; padding: 2px 0 6px; }
.pl-sec-t { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #4B4740; }
.pl-sec-t.ai { color: #40563C; }
.pl-sec-m { font-size: 12px; color: #9a9184; }
.pl-sec-acts { display: inline-flex; gap: 2px; margin-left: auto; }
.pl-sec-acts .pl-link { font-size: 12.5px; }
.pl-aibox { margin-top: 12px; padding: 10px 14px 10px; border-radius: 12px; background: #F3F7F0; border: 1px solid #DCE6D5; }
.pl-aibox .pl-item { border-top-color: #E2EADC; }
.pl-aibox .pl-item:first-of-type { border-top: none; }
.pl-aibox .pl-busy { margin: 4px 0 6px; }
.pl-ai-usage { margin-top: 2px; text-align: right; }
.pl-sysbox { margin-top: 12px; }
.pl-collapse.sm { padding: 3px 8px 3px 10px; font-size: 12px; }
.pl-sec .pl-chev { transform: rotate(180deg); transition: transform 0.25s; }
.pl-sec.closed .pl-chev { transform: rotate(0deg); }
.pl-sec-wrap { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.3s ease; }
.pl-sec.closed .pl-sec-wrap { grid-template-rows: 0fr; }
.pl-sec-inner { min-height: 0; overflow: hidden; }
.pl-more { display: inline-flex; align-items: center; gap: 5px; margin: 6px 0 2px; padding: 4px 2px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--primary-dark, #74896F); cursor: pointer; }
.pl-more:hover { text-decoration: underline; }
.pl-more svg { transition: transform 0.2s; }
.pl-sec.closed .pl-sec-inner { visibility: hidden; }
@media (prefers-reduced-motion: reduce) { .pl-sec-wrap, .pl-sec .pl-chev { transition: none; } }
.pl-sec-acts { align-items: center; gap: 6px; }
.pl-sec-n { font-size: 12px; color: #9a9184; }
.pl-mob-only { display: none; }
.pl-aibox.closed { padding-bottom: 6px; }
.pl-sysbox.closed .pl-sec-h { border-bottom-color: transparent; }
@media (max-width: 480px) { .pl-sec-h { flex-wrap: nowrap; } .pl-sec-n, .pl-sec-m { display: none; } .pl-sec-acts .pl-link { white-space: nowrap; padding: 2px; } .pl-mob-only { display: inline !important; } .pl-sec-m { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; } .pl-sec-t { white-space: nowrap; } }
.pl-sysbox .pl-sec-h { padding-bottom: 2px; border-bottom: 1px solid #f0ebe0; }
.pl-sysbox .pl-item:first-of-type { border-top: none; }
.pl-aicta { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 12px; border: 1px dashed #CFDBC8; background: #FAFCF8; }
.pl-aicta-ic { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; background: #E8EFE3; color: #5E7558; }
.pl-aicta-tx { flex: 1; min-width: 0; font-size: 13px; line-height: 1.5; color: #4B4740; }
.pl-aicta-tx small { display: block; font-size: 11.5px; color: #9a9184; }
.pl-aicta .pl-act { flex: none; }
@media (max-width: 480px) { .pl-aicta { flex-wrap: wrap; } .pl-aicta .pl-act { width: 100%; } }
.pl-side > .card { margin-bottom: 0; }
.pl-head-acts { display: inline-flex; align-items: center; gap: 2px 8px; flex-wrap: wrap; }
.pl-link.on { color: #40563C; font-weight: 600; }
.pl-fchips { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0 2px; }
.pl-fchips button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1px solid #E6E0D4; border-radius: 999px; background: #fff; font: inherit; font-size: 12.5px; color: #6b6358; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
.pl-fchips button span { font-size: 11px; color: #9a9184; }
@media (max-width: 640px) { .pl-fchips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-left: -2px; padding: 0 2px 2px; } .pl-fchips::-webkit-scrollbar { display: none; } .pl-fchips button { flex-shrink: 0; white-space: nowrap; } }
.pl-fchips button:hover { border-color: #CFC7B8; }
.pl-fchips button.on { border-color: #9AAB91; background: #EEF2EA; color: #40563C; font-weight: 600; }
.pl-fchips button.on span { color: #5E7558; }
.pl-item.g-watch .adv-ic { color: #D08A5E; }
.pl-item.g-good .adv-ic { color: #5E8A58; }
.pl-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pl-meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.pl-meta-row .pl-chips { margin-top: 0; }
.pl-meta-row .pl-acts { order: 2; margin: 0; }
/* ปุ่มให้คะแนนคำแนะนำ (ของ AI) ไปอยู่ท้ายสุด หลังปุ่มลงมือทำ */
.pl-meta-row .pl-chips { display: contents; }
.pl-meta-row .pl-rate { order: 3; }
.pl-act { padding: 5px 12px; border: 1px solid #D5DECF; border-radius: 999px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #4F6B47; cursor: pointer; transition: background 0.2s, border-color 0.2s; }
.pl-act:hover:not(:disabled) { background: #F1F3ED; border-color: #9AAB91; }
.pl-act.main { border-color: #7E9677; background: #7E9677; color: #fff; }
.pl-act.main:hover:not(:disabled) { background: #6B8364; border-color: #6B8364; }
.pl-act:disabled { opacity: 0.6; cursor: wait; }
.pl-ask { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: #F6F8F3; border: 1px solid #DCE4D6; font-size: 13px; line-height: 1.6; color: #3F3A34; }
.pl-ask-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.pl-ok { margin: 10px 0 0; padding: 8px 12px; border-radius: 8px; background: #EEF5EC; color: #3D6B3A; font-size: 13px; }
/* ===== ลองปรับเอง ===== */
.pl-sim { margin-top: 12px; padding: 12px 14px 14px; border-radius: 12px; background: #F8F6F0; border: 1px solid #ECE6DA; }
.pl-sim-head { position: relative; display: flex; flex-direction: column; gap: 2px; padding-right: 28px; margin-bottom: 8px; font-size: 13.5px; color: #3F3A34; }
.pl-sim-head span { font-size: 12px; color: #8A8177; }
.pl-sim-x { position: absolute; top: -4px; right: -4px; width: 28px; height: 28px; border: none; border-radius: 8px; background: none; font-size: 20px; line-height: 1; color: #9a9184; cursor: pointer; }
.pl-sim-x:hover { background: #EEE9DD; color: #4b5563; }
label.pl-sim-row { display: grid; grid-template-columns: minmax(80px, 130px) minmax(0, 1fr) 96px; flex-direction: row; align-items: center; gap: 10px; margin: 0; padding: 6px 0; font-size: 13px; color: #3F3A34; }
.pl-sim-row .nm { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
.pl-sim-row .nm small { font-size: 11px; color: #8A8177; }
.pl-sim-row .vv { text-align: right; font-weight: 600; white-space: nowrap; }
.pl-sim-row .vv small { font-weight: 400; color: #8A8177; }
.pl-sim-row input[type=range] { width: 100%; height: 6px; margin: 0; padding: 0; border: none; border-radius: 3px; appearance: none; -webkit-appearance: none; background: linear-gradient(to right, #7E9677 var(--p, 0%), #E3DDD0 var(--p, 0%)); cursor: pointer; }
.pl-sim-row input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid #7E9677; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
.pl-sim-row input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #7E9677; }
.pl-sim-row input[type=range]:focus-visible { outline: 2px solid #9AAB91; outline-offset: 4px; }
@media (max-width: 480px) { label.pl-sim-row { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; } .pl-sim-row input[type=range] { grid-column: 1 / -1; grid-row: 2; } }
.pl-sim-out { margin-top: 8px; padding-top: 10px; border-top: 1px dashed #DDD5C6; font-size: 13px; color: #4B4740; }
.pl-sim-hint { color: #8A8177; }
.pl-sim-big { font-size: 14px; } .pl-sim-big b { font-size: 18px; color: #40563C; } .pl-sim-big small { color: #8A8177; }
.pl-sim-sub { margin-top: 2px; font-size: 12.5px; color: #6b7280; }
.pl-sim-goals { display: grid; gap: 4px; margin: 8px 0 4px; padding: 0; list-style: none; }
.pl-sim-goals li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.pl-sim-goals li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-sim-goals li b { font-weight: 600; color: #6b6358; white-space: nowrap; }
.pl-sim-goals li.ok b { color: #3D6B3A; }
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

const BEH_KEY = 'finance_plan_behavior_hidden';
// แถบความคืบหน้าเล็ก (หน้าผู้ใช้ใหม่)
function Progress({ value, max, label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="pl-prog" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i style={{ width: `${pct}%` }} /><em>{label}</em>
    </span>
  );
}
// "ระบบกำลังเรียนรู้": มีรายการแล้วแต่ยังไม่มีเดือนเต็มก่อนหน้าให้เทียบ แสดงสิ่งที่จะเปิดใช้ได้เมื่อข้อมูลพอ
function LearningBanner({ an }) {
  const d = an.data || {};
  const days = an.days_elapsed || 0;
  const pmin = d.projection_min_days || 7;
  const wmin = d.weekday_min_days || 10;
  const items = [
    { key: 'proj', done: days >= pmin, text: 'ค่าเฉลี่ยต่อวันและคาดการณ์สิ้นเดือน', prog: <Progress value={Math.min(days, pmin)} max={pmin} label={`${Math.min(days, pmin)}/${pmin} วัน`} /> },
    { key: 'week', done: !!(an.weekday && an.weekday.reliable), text: 'วันไหนของสัปดาห์ใช้เงินมาก', prog: <Progress value={Math.min(d.record_days || 0, wmin)} max={wmin} label={`บันทึกแล้ว ${Math.min(d.record_days || 0, wmin)}/${wmin} วัน`} /> },
    { key: 'base', done: !!d.has_baseline, text: 'เทียบกับค่าปกติของคุณ และเตือนหมวดที่สูงผิดปกติ', prog: d.baseline_from ? <span className="pl-learn-date">เริ่ม {thaiDate(d.baseline_from)}</span> : null },
  ];
  return (
    <div className="pl-learn" data-learning>
      <div className="pl-learn-h"><IconSprout size={18} /><b>ระบบกำลังเรียนรู้นิสัยการใช้จ่ายของคุณ</b></div>
      <ul>
        {items.map((it) => (
          <li key={it.key} className={it.done ? 'done' : ''} data-learn-item={it.key}>
            <span className="ck" aria-hidden="true">{it.done ? '✓' : ''}</span>
            <span className="tx">{it.text}</span>
            {!it.done && it.prog}
          </li>
        ))}
      </ul>
    </div>
  );
}
// หน้าต้อนรับ: ยังไม่มีรายการเลย → 3 ขั้นตอนเริ่มต้น
function WelcomePlan({ data, navigate, onGoal }) {
  const d = (data.analysis && data.analysis.data) || {};
  const steps = [
    { key: 'txn', done: (d.txn_count || 0) > 0, title: 'บันทึกรายรับรายจ่าย', desc: 'จดทุกวันสักระยะ ระบบจะเริ่มวิเคราะห์ให้เอง', btn: 'บันทึกรายการ', go: () => navigate('/transactions', { state: { openAdd: true } }) },
    { key: 'budget', done: (data.budget_category_ids || []).length > 0, title: 'ตั้งงบประมาณ', desc: 'กำหนดเพดานให้หมวดที่อยากคุม เช่น อาหาร ช้อปปิ้ง', btn: 'ตั้งงบ', go: () => navigate('/budgets') },
    { key: 'goal', done: (data.goals || []).length > 0 || (data.achievements || []).length > 0, title: 'ตั้งเป้าหมายออม', desc: 'ระบบจะบอกว่าต้องออมเดือนละเท่าไรถึงจะทัน', btn: 'ตั้งเป้าหมาย', go: onGoal },
  ];
  return (
    <div className="card pl-welcome" data-plan-welcome>
      <div className="pl-welcome-ic" aria-hidden="true"><IconSprout size={30} /></div>
      <h3>เริ่มวางแผนการเงินกัน</h3>
      <p className="pl-welcome-sub">หน้านี้จะวิเคราะห์พฤติกรรมการใช้จ่าย และแนะนำสิ่งที่ควรทำ เมื่อมีรายการของคุณ</p>
      <ol className="pl-steps">
        {steps.map((st, i) => (
          <li key={st.key} className={st.done ? 'done' : ''} data-welcome-step={st.key}>
            <span className="n" aria-hidden="true">{st.done ? '✓' : i + 1}</span>
            <span className="t"><b>{st.title}</b><small>{st.desc}</small></span>
            {!st.done && <button type="button" className={`pl-act${i === 0 ? ' main' : ''}`} onClick={st.go}>{st.btn}</button>}
          </li>
        ))}
      </ol>
      <p className="pl-welcome-note">วิเคราะห์ได้เมื่อ: บันทึกครบ 7 วัน (ค่าเฉลี่ยต่อวัน) · 10 วัน (วันที่ใช้เงินมาก) · มีประวัติครบ 1 เดือน (เทียบกับค่าปกติของคุณ)</p>
    </div>
  );
}
// การ์ดสรุปด้านบน: ชี้เมาส์ (คอม) หรือแตะ (มือถือ) เพื่อเปิดกล่องรายละเอียด / แตะซ้ำ แตะที่อื่น หรือกด Esc เพื่อปิด
function HeroCard({ id, open, setOpen, warn, tip, children }) {
  const ptr = useRef('mouse');
  const isOpen = open === id;
  return (
    <div
      className={`pl-hero-c pl-hero-tip${warn ? ' warn' : ''}${isOpen ? ' open' : ''}`}
      data-hero={id}
      data-hero-card
      tabIndex={0}
      role="button"
      aria-expanded={isOpen}
      onPointerEnter={(e) => { ptr.current = e.pointerType; if (e.pointerType === 'mouse') setOpen(id); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen((v) => (v === id ? null : v)); }}
      onPointerDown={(e) => { ptr.current = e.pointerType; }}
      onClick={(e) => { if (e.target.closest('[data-tip-action]')) return; if (ptr.current !== 'mouse') setOpen((v) => (v === id ? null : id)); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => (v === id ? null : id)); } if (e.key === 'Escape') setOpen(null); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen((v) => (v === id ? null : v)); }}
    >
      {children}
      <span className="pl-hero-more" aria-hidden="true">i</span>
      {isOpen && <div className="pl-hero-pop" role="dialog" data-hero-pop={id} onClick={(e) => e.stopPropagation()}>{tip}</div>}
    </div>
  );
}
// หมวดที่ลองปรับได้: ไม่ใช่หมวดจ่ายก้อน และมีส่วนที่ไม่ใช่ค่าประจำ (ค่าประจำลดระหว่างเดือนไม่ได้)
const simable = (c) => !c.lumpy && c.base_avg - (c.fixed_avg || 0) > 0;
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // เรียงจันทร์ → อาทิตย์
const WD_H = 112; // ความสูงสูงสุดของแท่ง (px)
// กราฟ "ใช้จ่ายตามวันในสัปดาห์": ชี้เมาส์ / แตะ / โฟกัสด้วยคีย์บอร์ด เพื่อดูยอดของวันนั้น
function WeekdayChart({ days, peakDay, todayDay = null }) {
  const [act, setAct] = useState(null);
  const list = WD_ORDER.map((i) => days.find((d) => d.day === i)).filter(Boolean);
  const max = Math.max(1, ...list.map((d) => d.amount));
  const total = list.reduce((t, d) => t + d.amount, 0);
  const avgLine = total / 7;
  const sel = act !== null ? list.find((d) => d.day === act) : null;
  const pos = sel ? list.indexOf(sel) : -1;
  return (
    <div className={`pl-wd${act !== null ? ' has-act' : ''}`} data-days onMouseLeave={() => setAct(null)}>
      <div className="pl-wd-area">
        <span className="pl-wd-grid" style={{ bottom: `${WD_H}px` }} />
        <span className="pl-wd-grid" style={{ bottom: `${WD_H / 2}px` }} />
        <span className="pl-wd-avg" style={{ bottom: `${Math.round((avgLine / max) * WD_H)}px` }} />
        {list.map((d) => (
          <button
            type="button"
            key={d.day}
            className={`pl-wd-bar${d.day === todayDay ? ' today' : ''}${act === d.day ? ' on' : ''}`}
            aria-label={`วัน${d.name} รวม ${baht(d.amount)} จาก ${d.days} วัน เฉลี่ยวันละ ${baht(d.avg || 0)} คิดเป็น ${num1(d.share_pct)}% ของรายจ่าย`}
            data-wd={d.day}
            onMouseEnter={() => setAct(d.day)}
            onFocus={() => setAct(d.day)}
            onBlur={() => setAct(null)}
            onClick={() => setAct((v) => (v === d.day ? null : d.day))}
          >
            {d.day === peakDay && act === null && <em className="pl-wd-peak" style={{ bottom: `${Math.max(3, Math.round((d.amount / max) * WD_H)) + 3}px` }}><span className="pl-wd-pk">สูงสุด </span>{Math.round(d.share_pct)}%</em>}
            <i style={{ height: `${Math.max(3, Math.round((d.amount / max) * WD_H))}px` }} />
          </button>
        ))}
        {sel && (
          <div className={`pl-wd-tip${pos <= 1 ? ' l' : pos >= 5 ? ' r' : ''}`} style={{ left: `${((pos + 0.5) / 7) * 100}%` }} role="status" data-wd-tip>
            <b>วัน{sel.name}</b>
            <span>รวม {baht(sel.amount)} <small>({sel.days} วัน)</small></span>
            <span>เฉลี่ยวันละ {baht(sel.avg || 0)}</span>
            <span className="p">{num1(sel.share_pct)}% ของรายจ่าย</span>
          </div>
        )}
      </div>
      <div className="pl-wd-days">
        {list.map((d) => (
          <span key={d.day} className={d.day === todayDay ? 'today' : ''} data-wd-today={d.day === todayDay ? '' : undefined}>{DAY_SHORT[d.day]}</span>
        ))}
      </div>
    </div>
  );
}
const AI_HIDE_KEY = 'finance_plan_ai_hidden';
const SYS_HIDE_KEY = 'finance_plan_sys_hidden';
// ปุ่มซ่อน/แสดงเล็ก ๆ ที่หัวแต่ละส่วน
function SecToggle({ hidden, onClick, controls, label }) {
  return (
    <button type="button" className="pl-collapse sm" aria-expanded={!hidden} aria-controls={controls} aria-label={`${hidden ? 'แสดง' : 'ซ่อน'}${label}`} onClick={onClick}>
      {hidden ? 'แสดง' : 'ซ่อน'}
      <svg className="pl-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}
const GROUP_ORDER = ['watch', 'save', 'good'];
const ADV_SHOW = 3; // จำนวนคำแนะนำที่แสดงก่อนกด "ดูเพิ่ม" (ต่อส่วน)
const GROUP_LABEL = { watch: <><IconWarning size={13} /> ระวัง</>, save: <><IconPiggy size={13} /> โอกาสออม</>, good: <><IconThumb size={13} /> ทำได้ดี</> };
function actionLabel(a) {
  switch (a.type) {
    case 'set_budget': return a.next ? `ตั้งงบเดือนหน้า ${baht(a.amount)}` : `ตั้งงบ ${baht(a.amount)}`;
    case 'view_budget': return 'ดูงบหมวดนี้';
    case 'view_txns': return a.category_id ? 'ดูรายการหมวดนี้' : 'ดูรายการเดือนนี้';
    case 'simulate': return 'ลองปรับเอง';
    case 'new_goal': return 'ตั้งเป้าหมายออม';
    case 'view_inst': return 'ดูรายการผ่อน';
    default: return '';
  }
}
const IconCard = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 15h4" />
  </svg>
);
const IconArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
);
const IconSliders = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>
);

// ระยะเวลาเป็นเดือนแบบอ่านง่าย (ทศนิยม 1 ตำแหน่ง ไม่ถึงครึ่งเดือน = "ไม่ถึงเดือน")
const monthsText = (n) => (n < 0.5 ? 'ไม่ถึงเดือน' : `${num1(n)} เดือน`);

// แผง "ลองปรับเอง": เลื่อนลดรายจ่ายหมวดที่ใช้เยอะ (ครั้งละ 5% สูงสุด 50%) ดูว่าจะเหลือเก็บเพิ่มเท่าไร และเป้าหมายถึงเร็วขึ้นแค่ไหน
// คำนวณที่หลังบ้าน (POST /plan/simulate) ไม่บันทึกอะไร
function SimPanel({ cats, hasGoals, onClose }) {
  const [pcts, setPcts] = useState({});
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const any = Object.values(pcts).some((v) => v > 0);
  useEffect(() => {
    if (!any) { setRes(null); setErr(''); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.planSimulate(Object.entries(pcts).filter(([, v]) => v > 0).map(([id, v]) => ({ category_id: id, pct: -v })));
        if (live) { setRes(r.data); setErr(''); }
      } catch (e) {
        if (live) setErr(e.message || 'คำนวณไม่สำเร็จ');
      } finally {
        if (live) setBusy(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [pcts, any]);
  const local = cats.reduce((s, c) => s + ((c.base_avg - (c.fixed_avg || 0)) * (pcts[c.category_id] || 0)) / 100, 0); // แสดงทันทีระหว่างรอผลจากหลังบ้าน
  const delta = res ? res.scenario.delta_monthly : Math.round(local);
  const goalRows = res ? res.scenario.goals.map((g) => {
    const b = res.base.goals.find((x) => x.goal_id === g.goal_id) || {};
    const faster = b.eta_months !== null && b.eta_months !== undefined && g.eta_months !== null && g.eta_months !== undefined ? b.eta_months - g.eta_months : null;
    let text;
    if (g.status === 'reached') text = 'ครบแล้ว';
    else if (b.status !== 'on_track' && g.status === 'on_track') text = 'ทันกำหนดแล้ว';
    else if (b.status === 'no_surplus' && g.eta_months) text = `เริ่มออมได้ ถึงในราว ${monthsText(g.eta_months)}`;
    else if (faster !== null && faster >= 0.5) text = `เร็วขึ้นราว ${monthsText(faster)}`;
    else if (g.status === 'behind') text = `ยังช้ากว่ากำหนดราว ${monthsText(g.delay_months || 0)}`;
    else text = 'ไม่ค่อยเปลี่ยน';
    return { id: g.goal_id, name: g.name, text, ok: g.status === 'on_track' || g.status === 'reached' };
  }) : [];
  return (
    <div className="pl-sim" data-sim>
      <div className="pl-sim-head">
        <b>ลองปรับเอง</b><span>ถ้าลดรายจ่ายหมวดเหล่านี้ลง จะเป็นอย่างไร (แค่ลองดู ยังไม่บันทึกอะไร)</span>
        <button type="button" className="pl-sim-x" aria-label="ปิดแผงลองปรับเอง" onClick={onClose}>×</button>
      </div>
      {cats.map((c) => {
        const v = pcts[c.category_id] || 0;
        return (
          <label className="pl-sim-row" key={c.category_id} data-sim-row>
            <span className="nm">{c.name}<small>เฉลี่ย {baht(c.base_avg - (c.fixed_avg || 0))}/เดือน{c.fixed_avg > 0 ? ' (ไม่รวมค่าประจำ)' : ''}</small></span>
            <input type="range" min="0" max="50" step="5" value={v} aria-label={`ลดรายจ่ายหมวด ${c.name} กี่เปอร์เซ็นต์`} onChange={(e) => setPcts((p) => ({ ...p, [c.category_id]: Number(e.target.value) }))} style={{ '--p': `${v * 2}%` }} />
            <span className="vv">{v > 0 ? <>−{v}% <small>({baht(((c.base_avg - (c.fixed_avg || 0)) * v) / 100)})</small></> : '0%'}</span>
          </label>
        );
      })}
      <div className="pl-sim-out" aria-live="polite" data-sim-out>
        {!any ? <span className="pl-sim-hint">เลื่อนแถบเพื่อดูผล</span> : (
          <>
            <div className="pl-sim-big">เหลือเก็บเพิ่มราว <b>{baht(delta)}</b>/เดือน{busy && <small> กำลังคำนวณ...</small>}</div>
            {res && <div className="pl-sim-sub">เงินเหลือเฉลี่ยต่อเดือน {baht(res.base.surplus)} → {baht(res.scenario.surplus)}</div>}
            {res && goalRows.length > 0 && (
              <ul className="pl-sim-goals">
                {goalRows.map((g) => <li key={g.id} className={g.ok ? 'ok' : ''}><span>{g.name}</span><b>{g.text}</b></li>)}
              </ul>
            )}
            {res && !hasGoals && <div className="pl-sim-sub">ยังไม่มีเป้าหมาย ลองตั้งเป้าหมายเพื่อดูว่าจะถึงเร็วขึ้นแค่ไหน</div>}
            {err && <p className="pl-msg" role="alert">{err}</p>}
            <button type="button" className="pl-link" data-sim-reset onClick={() => setPcts({})}>ล้างค่า</button>
          </>
        )}
      </div>
    </div>
  );
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
  const navigate = useNavigate();
  const [behHidden, setBehHidden] = useState(() => { try { return localStorage.getItem(BEH_KEY) === '1'; } catch { return false; } }); // ซ่อนการ์ดพฤติกรรม (จำไว้)
  const toggleBeh = () => setBehHidden((v) => {
    try { localStorage.setItem(BEH_KEY, v ? '0' : '1'); } catch { /* ignore */ }
    return !v;
  });
  // ซ่อน/แสดงส่วน "AI วิเคราะห์" และ "ระบบวิเคราะห์" แยกกัน (จำไว้ในเบราว์เซอร์)
  const readFlag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
  const [aiHidden, setAiHidden] = useState(() => readFlag(AI_HIDE_KEY));
  const [sysHidden, setSysHidden] = useState(() => readFlag(SYS_HIDE_KEY));
  const flip = (setter, key) => setter((v) => { try { localStorage.setItem(key, v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  const [heroTip, setHeroTip] = useState(null); // การ์ดสรุปที่เปิดกล่องรายละเอียดอยู่
  useEffect(() => {
    if (!heroTip) return undefined;
    const close = (e) => { if (!e.target.closest('[data-hero-card]')) setHeroTip(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [heroTip]);
  const [advFilter, setAdvFilter] = useState('all'); // กรองคำแนะนำ: all / watch / save / good
  const [advMore, setAdvMore] = useState({ ai: false, sys: false }); // แสดงคำแนะนำทั้งหมด (ปกติแสดง ADV_SHOW ข้อแรกของแต่ละส่วน)
  const [simOpen, setSimOpen] = useState(false); // เปิดแผง "ลองปรับเอง"
  const [budgetAsk, setBudgetAsk] = useState(null); // { key, action } ยืนยันก่อนตั้งงบจากคำแนะนำ
  const [actBusy, setActBusy] = useState(false);
  const [actMsg, setActMsg] = useState('');
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
    setBudgetAsk(null);
    setActMsg('');
    setSimOpen(false);
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

  // ปุ่มลงมือทำใต้คำแนะนำ
  const runAction = (it, a) => {
    setActMsg('');
    const [y, m] = data.month.split('-').map(Number);
    switch (a.type) {
      case 'set_budget': setBudgetAsk({ key: it.key, action: a }); break;
      case 'view_budget': navigate(`/budgets?month=${a.period ? a.period.month : m}&year=${a.period ? a.period.year : y}`); break;
      case 'view_txns': navigate(`/transactions?month=${data.month}${a.category_id ? `&category=${a.category_id}` : ''}`); break;
      case 'simulate':
        setSimOpen(true);
        setTimeout(() => { const el = document.querySelector('[data-sim]'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
        break;
      case 'new_goal': pickTab('goals'); setGoalView('active'); setGoalModal({ goal: null }); break;
      case 'view_inst': pickTab('installments'); setInstView('active'); break;
      default: break;
    }
  };
  const confirmBudget = async () => {
    if (!budgetAsk) return;
    const a = budgetAsk.action;
    const [y, m] = data.month.split('-').map(Number);
    const pm = a.period ? a.period.month : m;
    const py = a.period ? a.period.year : y;
    setActBusy(true);
    try {
      await api.createBudget({ category_id: a.category_id, amount_limit: a.amount, period_month: pm, period_year: py, repeat: true });
      if (!alive.current) return;
      setBudgetAsk(null);
      setActMsg(`ตั้งงบหมวด “${a.name}” เดือนละ ${baht(a.amount)} แล้ว${a.next ? ` เริ่ม ${thaiMonth(`${py}-${String(pm).padStart(2, '0')}`)}` : ''}`);
      await load();
    } catch (e) {
      if (alive.current) setActMsg(e.message || 'ตั้งงบไม่สำเร็จ');
    } finally {
      if (alive.current) setActBusy(false);
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
            {t.id === 'installments' && inst && inst.summary.attention && <span className="pl-tab-dot" title="มีบิลค้างชำระหรือใกล้ครบกำหนด" aria-label="มีบิลค้างชำระหรือใกล้ครบกำหนด" data-inst-dot />}
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
              <IconCheckCircle size={14} /> ผ่อนเสร็จแล้ว <span className="pl-seg-n">{inst.done.length}</span>
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
                <IconTrophy size={14} /> สำเร็จแล้ว <span className="pl-seg-n gold">{(data.achievements || []).length}</span>
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
  const proj = an.projection;
  // แถบรายหมวด (การ์ดพฤติกรรม): เฉพาะส่วนที่ผู้ใช้ควบคุมได้ ไม่รวมค่าประจำ และไม่แสดงหมวดจ่ายเป็นก้อน
  //  (ข้อมูลเก่าที่ยังไม่มี var_* ใช้ยอดรวมแทน)
  const catRows = an.categories
    .filter((c) => !c.lumpy)
    .map((c) => (c.var_amount === undefined ? c : { ...c, amount: c.var_amount, expected_to_date: c.var_expected, pct_vs_expected: c.var_pct, flagged: c.var_flagged }))
    .filter((c) => c.amount > 0)
    .sort((x, y) => y.amount - x.amount)
    .slice(0, 6);
  const catMax = Math.max(1, ...catRows.map((c) => Math.max(c.amount, c.expected_to_date || 0)));
  const isCur = data.is_current !== false; // false = กำลังดูเดือนที่ผ่านมา (ดูอย่างเดียว)
  const instFacts = data.installments || null; // ภาระผ่อน (เฉพาะเดือนปัจจุบัน)
  const canSim = isCur && an.baseline && an.baseline.avg_surplus !== null && (an.base_categories || []).some(simable);

  const wk = an.weekly || null; // ใช้จ่าย 7 วันล่าสุด (ไม่รวมรายจ่ายก้อน)
  // ผู้ใช้ใหม่: ยังไม่มีรายการเลย (เดือนปัจจุบัน) → หน้าต้อนรับ / มีรายการแต่ยังไม่มีเดือนเต็มก่อนหน้า → แถบ "ระบบกำลังเรียนรู้"
  const isNewUser = isCur && an.data && an.data.has_data === false;
  const isLearning = isCur && an.data && an.data.has_data && !an.data.has_baseline;
  const topCat = an.categories && an.categories.length ? an.categories[0] : null;

  // รายการคำแนะนำรวม: ของ AI + ของระบบ (ข้ามข้อของระบบที่ใช้ตัวเลขชุดเดียวกับของ AI เพราะพูดเรื่องเดียวกัน)
  // เรียงตามประเภท ระวัง → โอกาสออม → ทำได้ดี (ในประเภทเดียวกัน AI ก่อน) แล้วกรองตามปุ่มที่เลือก
  const aiItems = saved ? saved.items : [];
  const aiFactIds = new Set(aiItems.flatMap((it) => (it.facts_used || []).map((f) => f.id)));
  const sysItems = data.rules_advice.filter((it) => !(it.facts_used || []).some((f) => aiFactIds.has(f.id)));
  const allItems = [
    ...aiItems.map((it, i) => ({ ...it, source: 'ai', index: i, key: `ai-${i}` })),
    ...sysItems.map((it, i) => ({ ...it, source: 'rules', key: `sys-${i}` })),
  ].map((it, order) => ({ ...it, order })).sort((x, y) => (GROUP_ORDER.indexOf(x.group || 'save') - GROUP_ORDER.indexOf(y.group || 'save')) || x.order - y.order);
  const groupCounts = GROUP_ORDER.map((g) => [g, allItems.filter((it) => (it.group || 'save') === g).length]).filter(([, n]) => n > 0);
  const filterOn = advFilter !== 'all' && groupCounts.some(([g]) => g === advFilter) ? advFilter : 'all';
  const shownItems = filterOn === 'all' ? allItems : allItems.filter((it) => (it.group || 'save') === filterOn);
  const shownAi = shownItems.filter((it) => it.source === 'ai');
  const shownSys = shownItems.filter((it) => it.source !== 'ai');
  // แต่ละส่วนแสดง ADV_SHOW ข้อแรก (เรียงตามความสำคัญแล้ว) ที่เหลือกด "ดูเพิ่ม"
  const visAi = advMore.ai ? shownAi : shownAi.slice(0, ADV_SHOW);
  const visSys = advMore.sys ? shownSys : shownSys.slice(0, ADV_SHOW);
  const moreBtn = (key, list) => list.length > ADV_SHOW && (
    <button type="button" className="pl-more" aria-expanded={advMore[key]} data-adv-more={key} onClick={() => setAdvMore((m) => ({ ...m, [key]: !m[key] }))}>
      {advMore[key] ? 'ย่อ' : `ดูเพิ่มอีก ${list.length - ADV_SHOW} ข้อ`}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: advMore[key] ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
  // คำแนะนำ 1 ข้อ (ใช้ทั้งในกรอบ AI และส่วนของระบบ ไม่ต้องมีป้ายบอกที่มาแล้ว เพราะแยกกรอบชัดเจน)
  const renderItem = (it) => (
    <div className={`pl-item g-${it.group || 'save'}`} key={it.key} data-ai-item={it.source === 'ai' ? '' : undefined} data-rule-item={it.source === 'ai' ? undefined : ''} data-group={it.group || 'save'}>
      <AdviceIcon tag={it.tag} />
      <div className="tx">
        <div>{it.text}</div>
        {/* ตัวเลขอ้างอิง + ปุ่มลงมือทำ อยู่บรรทัดเดียวกัน (จอแคบขึ้นบรรทัดใหม่เอง) */}
        <div className="pl-meta-row">
          {((it.facts_used && it.facts_used.length > 0) || it.source === 'ai') && (
            <div className="pl-chips" data-chips>
              <Chips facts={it.facts_used} />
              {it.source === 'ai' && (
                <span className="pl-rate">
                  <button type="button" aria-pressed={it.rating === 1} aria-label="คำแนะนำนี้เป็นประโยชน์" data-rate-up onClick={() => rate(it.index, 1)}><IconThumb size={15} /></button>
                  <button type="button" aria-pressed={it.rating === -1} aria-label="คำแนะนำนี้ไม่เป็นประโยชน์" data-rate-down onClick={() => rate(it.index, -1)}><IconThumb size={15} down /></button>
                </span>
              )}
            </div>
          )}
          {it.actions && it.actions.length > 0 && !(budgetAsk && budgetAsk.key === it.key) && (
            <div className="pl-acts" data-acts>
              {it.actions.map((a) => (
                <button type="button" key={a.type} className={`pl-act${a.type === 'set_budget' || a.type === 'new_goal' ? ' main' : ''}`} data-act={a.type} onClick={() => runAction(it, a)}>{actionLabel(a)}</button>
              ))}
            </div>
          )}
        </div>
        {budgetAsk && budgetAsk.key === it.key && it.actions && it.actions.length > 0 && (
          <div className="pl-ask" data-budget-ask>
            <span>ตั้งงบหมวด “{budgetAsk.action.name}” เดือนละ <b>{baht(budgetAsk.action.amount)}</b> (ค่าเฉลี่ยของคุณ ปัดเป็นหลักร้อย){budgetAsk.action.next && budgetAsk.action.period ? <> เริ่ม <b>{thaiMonth(`${budgetAsk.action.period.year}-${String(budgetAsk.action.period.month).padStart(2, '0')}`)}</b> เพราะเดือนนี้ใช้เกินยอดนี้ไปแล้ว</> : ''} ใช้ต่อเนื่องทุกเดือน แก้ได้ทีหลังที่หน้างบประมาณ</span>
            <span className="pl-ask-btns">
              <button type="button" className="pl-act main" disabled={actBusy} data-budget-confirm onClick={confirmBudget}>{actBusy ? 'กำลังตั้งงบ...' : 'ตั้งงบ'}</button>
              <button type="button" className="pl-act" disabled={actBusy} onClick={() => setBudgetAsk(null)}>ยกเลิก</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );

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

      {!isNewUser && isLearning && <LearningBanner an={an} />}
      {!isNewUser && !isLearning && an.limits.length > 0 && (
        <div className="pl-limits" data-plan-limits>
          {an.limits.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}

      {isNewUser ? (
        <WelcomePlan
          data={data}
          navigate={navigate}
          onGoal={() => { pickTab('goals'); setGoalView('active'); setGoalModal({ goal: null }); }}
        />
      ) : (
      <>
      {/* ===== 1 การ์ดสรุป 4 ใบ ===== */}
      <div className="pl-hero" data-plan-hero>
        <div className={`pl-hero-c${pctBase !== null && pctBase >= 10 ? ' warn' : ''}`} data-hero="daily">
          <div className="l">ใช้จ่ายเฉลี่ยต่อวัน</div>
          <div className="v">{an.daily.avg === null ? '-' : baht(an.daily.avg)}</div>
          <div className="s">{pctBase === null ? 'ยังไม่มีค่าเฉลี่ยให้เทียบ' : pctBase >= 100 ? `${num1(timesOf(pctBase))} เท่าของค่าเฉลี่ยเดิม` : `${pctBase > 0 ? 'สูงกว่า' : pctBase < 0 ? 'ต่ำกว่า' : 'เท่ากับ'}ค่าเฉลี่ยเดิม${pctBase === 0 ? '' : ` ${num1(Math.abs(pctBase))}%`}`}</div>
          {an.daily.excludes_lumpy && <div className="x" data-daily-ex>ไม่รวมค่าประจำและรายจ่ายก้อน</div>}
        </div>
        {wk && wk.last7 !== null && wk.last7 !== undefined && (
          <div className={`pl-hero-c${wk.pct_vs_base !== null && wk.pct_vs_base >= 10 ? ' warn' : ''}`} data-hero="weekly" title={`${thaiDate(wk.from)} – ${thaiDate(wk.to)}`}>
            <div className="l">{isCur ? 'ใช้จ่าย 7 วันล่าสุด' : 'ใช้จ่าย 7 วันสุดท้ายของเดือน'}</div>
            <div className="v">{baht(wk.last7)}</div>
            <div className="s">{wk.base ? `สัปดาห์ปกติ ${baht(wk.base)}${wk.pct_vs_base !== null ? ` (${pctOrTimes(wk.pct_vs_base)})` : ''}` : 'ยังไม่มีค่าเฉลี่ยให้เทียบ'}</div>
            {isCur && wk.trend === 'down' && <span className="pl-trend g" data-week-trend="down">↓ ช่วงนี้ใช้น้อยลง</span>}
            {isCur && wk.trend === 'up' && <span className="pl-trend o" data-week-trend="up">↑ ช่วงนี้ใช้เร็วขึ้น</span>}
          </div>
        )}
        <HeroCard id="anomaly" open={heroTip} setOpen={setHeroTip} warn={!!top} tip={(
          <>
            <b className="t">หมวดที่สูงกว่าปกติ</b>
            {an.anomalies.length === 0 ? <p className="n">{an.data.has_baseline ? 'ทุกหมวดอยู่ในระดับปกติของคุณ' : 'ยังไม่มีค่าเฉลี่ยให้เทียบ'}</p> : an.anomalies.map((c) => (
              <div className="r" key={c.category_id}><span>{c.name} <small>(ปกติ {baht(c.expected_to_date)})</small></span><b className="up">{baht(c.amount)}</b></div>
            ))}
            <p className="n">เทียบกับระดับปกติถึงวันนี้ ไม่รวมค่าประจำและรายจ่ายพิเศษ</p>
          </>
        )}>
          <div className="l">{!an.data.has_baseline && topCat ? 'ใช้มากสุดเดือนนี้' : 'หมวดที่สูงผิดปกติ'}</div>
          <div className="v">{top ? top.name : !an.data.has_baseline && topCat ? topCat.name : 'ไม่พบ'}</div>
          <div className="s">{top ? `${baht(top.amount)} ${top.pct_vs_expected >= 100 ? `· ${num1(timesOf(top.pct_vs_expected))} เท่าของปกติ` : `สูงกว่าปกติ ${num1(top.pct_vs_expected)}%`}${an.anomalies.length > 1 ? ` · อีก ${an.anomalies.length - 1} หมวด` : ''}` : an.data.has_baseline ? 'ทุกหมวดอยู่ในระดับปกติของคุณ' : topCat ? `${baht(topCat.amount)} · ${num1(topCat.share_pct)}% ของรายจ่าย` : 'ยังไม่มีค่าเฉลี่ยให้เทียบ'}</div>
        </HeroCard>
        {(() => {
          // ค่าใช้จ่ายประจำ (ค่าเช่า ค่าน้ำไฟ ค่าสมาชิก งวดผ่อน ฯลฯ) + ภาระผ่อนต่อเดือน กดไปแท็บรายการผ่อนได้
          const fm = an.fixed_month || { total: 0, paid: 0, pending: 0, pct_of_income: null, by_category: [] };
          const todayKey = isCur && an.weekly ? an.weekly.to : null;
          const load = isCur && instFacts ? instFacts.load : 0;
          const burden = isCur && instFacts ? instFacts.burden_pct : null;
          const warn = (fm.pct_of_income !== null && fm.pct_of_income > 50) || (burden !== null && burden > 30);
          const sub = fm.total > 0 ? (fm.pct_of_income !== null ? `${num1(fm.pct_of_income)}% ของรายรับ` : 'ยังไม่มีรายรับให้เทียบ') : 'ยังไม่มีค่าใช้จ่ายประจำ';
          const body = (
            <>
              <div className="l">ค่าใช้จ่ายประจำ{isCur ? '' : 'เดือนนั้น'}</div>
              <div className="v">{baht(fm.total)}</div>
              <div className="s">{sub}</div>
              {load > 0 && <div className={`x${burden !== null && burden > 30 ? ' warn' : ''}`}>ผ่อน {baht(load)}/เดือน{burden !== null ? ` (${num1(burden)}%)` : ''}</div>}
            </>
          );
          return (
            <HeroCard id="fixed" open={heroTip} setOpen={setHeroTip} warn={warn} tip={(
              <>
                <b className="t">ค่าใช้จ่ายประจำ{isCur ? 'เดือนนี้' : 'เดือนนั้น'}</b>
                {fm.by_category.length === 0 ? <p className="n">ยังไม่มีค่าใช้จ่ายประจำ</p> : fm.by_category.map((c) => {
                  const done = c.status === 'paid' || c.status === undefined;
                  const late = !done && c.due_date && todayKey && c.due_date < todayKey;
                  return (
                    <div className="r" key={c.category_id} data-fixed-row={c.status || 'paid'} title={done ? 'จ่ายแล้ว' : late ? 'เลยกำหนด' : `รอจ่าย${c.due_date ? ` ราว ${thaiDate(c.due_date)}` : ''}`}>
                      <span><i className={`pl-dot ${done ? 'ok' : late ? 'late' : 'wait'}`} />{c.name}</span>
                      <b>{baht(c.amount)}</b>
                    </div>
                  );
                })}
                {fm.total > 0 && <div className="r sum"><span>รวม</span><b>{baht(fm.total)}</b></div>}
                {fm.total > 0 && (
                  <p className="pl-dot-lg"><span><i className="pl-dot ok" />จ่ายแล้ว</span><span><i className="pl-dot wait" />รอจ่าย</span>{fm.by_category.some((c) => c.status !== 'paid' && c.due_date && todayKey && c.due_date < todayKey) && <span><i className="pl-dot late" />เลยกำหนด</span>}</p>
                )}
              </>
            )}>
              {body}
            </HeroCard>
          );
        })()}
      </div>

      {/* ===== 2 พฤติกรรมการใช้จ่าย (ซ่อนได้ ระบบจำไว้) ===== */}
      <div className={`card pl-beh${behHidden ? ' closed' : ''}`} data-plan-behavior>
        <div className="pl-beh-head">
          <InfoTitle title={<><span className="pl-ti"><IconChart size={18} /></span>{isCur ? 'พฤติกรรมการใช้จ่าย' : `พฤติกรรมการใช้จ่าย ${thaiMonth(data.month)}`}</>} label="คำอธิบายส่วนนี้" popId="pl-info-behavior">
            <p>เทียบกับค่าเฉลี่ยของเดือนเต็มก่อนหน้า (สูงสุด 3 เดือน เฉพาะเดือนที่มีรายการ) เส้นตั้งในแถบรายหมวดคือ “ระดับปกติของคุณ” ณ วันนี้ หมวดที่ถือว่าสูงผิดปกติคือสูงกว่าระดับปกติตั้งแต่ 30% และเกินอย่างน้อย 200 บาท การ์ดนี้ดูเฉพาะการใช้จ่ายที่คุณเลือกเองได้ ไม่รวมค่าประจำ (รายการเกิดซ้ำรายเดือน งวดผ่อน ค่าสมาชิกที่ตัดเดือนละครั้ง) และรายจ่ายก้อน เช่น ค่าเช่า</p>
          </InfoTitle>
          <button type="button" className="pl-collapse" aria-expanded={!behHidden} aria-controls="pl-beh-body" data-beh-toggle onClick={toggleBeh}>
            {behHidden ? 'แสดง' : 'ซ่อน'}
            <svg className="pl-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
        <div className="pl-beh-wrap" id="pl-beh-body" aria-hidden={behHidden}>
          <div className="pl-beh-inner">
            <div className="pl-beh-grid">
              <div className="pl-beh-col" data-beh-days>
                <div className="pl-beh-sub">ใช้จ่ายตามวันในสัปดาห์ <span>{isCur ? 'รวม 90 วันล่าสุด' : 'รวม 90 วันถึงสิ้นเดือน'}</span></div>
                {an.weekday.reliable ? (
                  <>
                    <WeekdayChart days={an.weekday.by_day} peakDay={an.weekday.peak ? peakDay.day : null} todayDay={isCur && an.weekly ? new Date(`${an.weekly.to}T00:00:00Z`).getUTCDay() : null} />
                    <p className="pl-wd-legend" title="แต่ละแท่ง = ยอดรวมของวันนั้นทุกสัปดาห์ในช่วง 90 วัน (เช่น ทุกวันจันทร์)">
                      {isCur && <span><i className="pl-lg-peak" />วันนี้</span>}
                      <span><i className="pl-lg-dash" />เฉลี่ยทุกวัน</span>
                      <span><i className="pl-lg-pk">สูงสุด</i>วันที่ใช้มากที่สุด</span>
                    </p>
                  </>
                ) : (
                  <div className="pl-wait" data-weekday-wait>
                    <p>บันทึกรายจ่ายครบ {an.data.weekday_min_days || 10} วัน จะเห็นว่าวันไหนของสัปดาห์คุณมักใช้เงินมาก</p>
                    <Progress value={Math.min(an.data.record_days || 0, an.data.weekday_min_days || 10)} max={an.data.weekday_min_days || 10} label={`${Math.min(an.data.record_days || 0, an.data.weekday_min_days || 10)}/${an.data.weekday_min_days || 10} วัน`} />
                  </div>
                )}
                {an.small_purchases.flagged && (
                  <p className="pl-note" data-small>รายจ่ายน้อยกว่า {an.small_purchases.threshold} บาทมี {an.small_purchases.count} ครั้งใน {an.small_purchases.days} วัน รวม {baht(an.small_purchases.total)} ({num1(an.small_purchases.share_pct)}% ของรายจ่าย)</p>
                )}
              </div>
              <div className="pl-beh-col" data-beh-cats>
                <div className="pl-beh-sub">{an.data.has_baseline ? 'รายหมวดเทียบระดับปกติ' : `ใช้จ่ายรายหมวด${isCur ? 'เดือนนี้' : 'เดือนนั้น'}`} {an.data.has_baseline && <span><i className="pl-lg-bar" />{isCur ? 'เดือนนี้' : 'เดือนนั้น'} <i className="pl-lg-mark" />ระดับปกติ</span>}</div>
                {catRows.length === 0 ? <p className="pl-empty">ยังไม่มีรายจ่าย{isCur ? 'เดือนนี้' : 'ในเดือนนั้น'}</p> : (
                  <div className="pl-cbars">
                    {catRows.map((c) => (
                      <div className={`pl-cbar${c.flagged ? ' flag' : ''}`} key={c.category_id} data-cat-row>
                        <span className="nm" title={c.name}>{c.name}</span>
                        <span className="tr" title={c.expected_to_date === null ? '' : `ระดับปกติถึงวันนี้ ${baht(c.expected_to_date)}`}>
                          <i style={{ width: `${Math.min(100, (c.amount / catMax) * 100)}%` }} />
                          {c.expected_to_date !== null && c.expected_to_date !== undefined && <b style={{ left: `${Math.min(100, (c.expected_to_date / catMax) * 100)}%` }} />}
                        </span>
                        <span className="am">{baht(c.amount)}{c.pct_vs_expected !== null && <em>{pctOrTimes(c.pct_vs_expected)}</em>}</span>
                      </div>
                    ))}
                  </div>
                )}
                {an.special && an.special.total > 0 && (
                  <div className="pl-special" data-special>
                    <div className="pl-special-h">
                      <span title={`รายการก้อนใหญ่ที่นาน ๆ มีครั้ง${an.special.threshold ? ` (ตั้งแต่ ${baht(an.special.threshold)} ต่อรายการ)` : ''} แยกไว้ ไม่นำไปเทียบกับการใช้จ่ายปกติ`}>รายจ่ายพิเศษ</span>
                      {an.special.items.length > 1 && <b>{baht(an.special.total)}</b>}
                    </div>
                    <ul>
                      {an.special.items.map((it, i) => (
                        <li key={`${it.date}-${i}`} data-special-item>
                          <span className="d">{thaiDate(it.date).replace(/ \d{4}$/, '')}</span>
                          <span className="n" title={it.note ? `${it.note} · ${it.category_name}` : it.category_name}>{it.note || it.category_name}</span>
                          <span className="a">{baht(it.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pl-grid">
        {/* ===== 3 สิ่งที่ควรทำ (คำแนะนำของ AI และของระบบ + ปุ่มลงมือทำ + ลองปรับเอง) ===== */}
        <div className="card" data-plan-advice>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconSpark size={18} /></span>{isCur ? 'สิ่งที่ควรทำเดือนนี้' : 'คำแนะนำของเดือนนั้น'}</>} label="คำอธิบายส่วนนี้" popId="pl-info-advice">
              <p>กรอบ “AI วิเคราะห์” คือคำแนะนำที่ AI เขียนจากตัวเลขสรุปเมื่อคุณกดขอ (ไม่ส่งรายการรายตัว บันทึกช่วยจำ หรือชื่อรายการผ่อน) ระบบตรวจตัวเลขในข้อความทุกตัวก่อนแสดง ถ้าไม่ตรงกับที่ระบบคำนวณจะไม่แสดงข้อนั้น ส่วน “ระบบวิเคราะห์” คำนวณด้วยกฎ ใช้ได้ตลอดแม้ไม่ใช้ AI ปุ่มใต้คำแนะนำช่วยลงมือทำได้ทันที เช่น ตั้งงบ (ถามยืนยันก่อนเสมอ) คำแนะนำเป็นแนวทางเรื่องงบประมาณและการออมเท่านั้น ไม่เกี่ยวกับการลงทุน</p>
            </InfoTitle>
            <span className="pl-head-acts">
              {canSim && (
                <button type="button" className={`pl-link${simOpen ? ' on' : ''}`} data-sim-open aria-expanded={simOpen} onClick={() => setSimOpen((v) => !v)}>
                  <IconSliders size={14} />ลองปรับเอง
                </button>
              )}
            </span>
          </div>

          {simOpen && canSim && <SimPanel cats={an.base_categories.filter(simable).slice(0, 5)} hasGoals={data.goals.length > 0} onClose={() => setSimOpen(false)} />}

          {allItems.length > 1 && groupCounts.length > 1 && (
            <div className="pl-fchips" role="group" aria-label="กรองคำแนะนำ" data-adv-filter>
              <button type="button" className={advFilter === 'all' ? 'on' : ''} aria-pressed={advFilter === 'all'} onClick={() => setAdvFilter('all')}>ทั้งหมด <span>{allItems.length}</span></button>
              {groupCounts.map(([g, n]) => (
                <button type="button" key={g} className={`${advFilter === g ? 'on' : ''} g-${g}`} aria-pressed={advFilter === g} data-adv-filter-g={g} onClick={() => setAdvFilter(g)}>{GROUP_LABEL[g]} <span>{n}</span></button>
              ))}
            </div>
          )}

          {actMsg && <p className="pl-ok" role="status" data-act-msg>{actMsg}</p>}

          {/* ----- ส่วนของ AI (กรอบสีเขียวอ่อน แยกจากของระบบชัดเจน) ----- */}
          {(saved || aiBusy) && (filterOn === 'all' || shownAi.length > 0 || aiBusy) && (
            <section className={`pl-aibox pl-sec${aiHidden && !aiBusy ? ' closed' : ''}`} data-ai-box aria-label="คำแนะนำจาก AI">
              <div className="pl-sec-h">
                <span className="pl-sec-t ai"><IconSpark size={15} />AI วิเคราะห์</span>
                {saved && !aiBusy && <span className="pl-sec-m" data-ai-generated>{new Date(saved.generated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                {!aiBusy && (
                  <span className="pl-sec-acts">
                    {!aiHidden && isCur && ai.configured && <button type="button" className="pl-link" data-ai-ask onClick={askAi} disabled={ai.plans_used_today >= ai.plan_daily_limit}>วิเคราะห์ใหม่</button>}
                    {!aiHidden && saved && <button type="button" className="pl-link" data-ai-delete onClick={dropAdvice}>ลบ</button>}
                    {aiHidden && <span className="pl-sec-n">{shownAi.length} ข้อ</span>}
                    <SecToggle hidden={aiHidden} controls="pl-ai-body" label="คำแนะนำจาก AI" onClick={() => flip(setAiHidden, AI_HIDE_KEY)} />
                  </span>
                )}
              </div>
              <div className="pl-sec-wrap" id="pl-ai-body" data-ai-body><div className="pl-sec-inner">
              {aiBusy && (
                <div className="pl-busy" data-ai-busy-wrap>
                  <span data-ai-busy>AI กำลังเขียนคำแนะนำ... {aiElapsed} วินาที</span>
                  <button type="button" className="pl-link" data-ai-cancel onClick={cancelAdvice}>ยกเลิก</button>
                </div>
              )}
              {!aiBusy && visAi.map(renderItem)}
              {!aiBusy && moreBtn('ai', shownAi)}
              {!aiBusy && saved && saved.stale && <p className="pl-stale" role="status" data-ai-stale>{isCur ? 'ข้อมูลของคุณเปลี่ยนไปหลังจาก AI เขียน ตัวเลขอาจไม่ตรงแล้ว กด “วิเคราะห์ใหม่” เพื่ออัปเดต' : 'รายการของเดือนนั้นถูกแก้ไขหลังจาก AI เขียน ตัวเลขอาจไม่ตรงแล้ว'}</p>}
              {!aiBusy && aiDropped > 0 && <p className="pl-note" data-ai-dropped>AI เสนอเพิ่มอีก {aiDropped} ข้อที่ตัวเลขไม่ตรงกับที่ระบบคำนวณ ระบบจึงไม่แสดง</p>}
              {(saved || (isCur && ai.configured)) && (
                <p className="pl-note pl-ai-usage" data-ai-usage>
                  {saved && <span className="pl-mob-only">เขียนเมื่อ {new Date(saved.generated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}{isCur && ai.configured ? ' · ' : ''}</span>}
                  {isCur && ai.configured && `วันนี้ขอไปแล้ว ${ai.plans_used_today}/${ai.plan_daily_limit} ครั้ง`}
                </p>
              )}
              </div></div>
            </section>
          )}
          {aiMsg && <p className="pl-msg" role="alert" data-ai-msg>{aiMsg}</p>}

          {/* ----- ส่วนของระบบ ----- */}
          {shownSys.length > 0 && (
            <section className={`pl-sysbox pl-sec${sysHidden ? ' closed' : ''}`} data-sys-box aria-label="คำแนะนำจากระบบ">
              <div className="pl-sec-h">
                <span className="pl-sec-t">ระบบวิเคราะห์</span>
                <span className="pl-sec-m">คำนวณจากรายการของคุณ</span>
                <span className="pl-sec-acts">
                  {sysHidden && <span className="pl-sec-n">{shownSys.length} ข้อ</span>}
                  <SecToggle hidden={sysHidden} controls="pl-sys-body" label="คำแนะนำจากระบบ" onClick={() => flip(setSysHidden, SYS_HIDE_KEY)} />
                </span>
              </div>
              <div className="pl-sec-wrap" id="pl-sys-body" data-sys-body><div className="pl-sec-inner">
                {visSys.map(renderItem)}
                {moreBtn('sys', shownSys)}
              </div></div>
            </section>
          )}

          {/* ยังไม่มีคำแนะนำของ AI: แถบเชิญชวนเล็ก ๆ ท้ายการ์ด */}
          {!saved && !aiBusy && isCur && ai.configured && (
            <div className="pl-aicta" data-ai-cta>
              <span className="pl-aicta-ic"><IconSpark size={16} /></span>
              <span className="pl-aicta-tx">อยากได้มุมมองเพิ่ม ให้ AI ช่วยอ่านตัวเลขสรุปแล้วเขียนคำแนะนำ<small>วันนี้ขอได้อีก {Math.max(0, ai.plan_daily_limit - ai.plans_used_today)} ครั้ง</small></span>
              <button type="button" className="pl-act main" data-ai-ask onClick={askAi} disabled={ai.plans_used_today >= ai.plan_daily_limit}>ให้ AI วิเคราะห์</button>
            </div>
          )}
          {isCur && !ai.configured && <p className="pl-empty" data-ai-unavailable>ระบบนี้ยังไม่เปิดบริการ AI ดูคำแนะนำจากระบบได้</p>}
          {!isCur && !saved && <p className="pl-empty" data-ai-past-note>เดือนนั้นไม่มีคำแนะนำของ AI ที่เก็บไว้ ขอ AI วิเคราะห์ได้เฉพาะเดือนปัจจุบัน</p>}

          <div className="pl-foot">
            <p className="pl-note" data-disclaimer>ตัวเลขทุกตัวคำนวณจากรายการของคุณโดยระบบ AI เป็นผู้เขียนคำอธิบาย ไม่ใช่คำแนะนำทางการเงินจากผู้เชี่ยวชาญ</p>
          </div>
        </div>

        <div className="pl-side">
        {/* ===== 3 สรุปเป้าหมายการออม (แบบย่อ) กดเพื่อไปแท็บเป้าหมายออม ===== */}
        <div className="card" data-plan-goals-summary>
          <div className="pl-card-head">
            <InfoTitle title={<><span className="pl-ti"><IconFlag size={18} /></span>เป้าหมายการออม</>} label="คำอธิบายส่วนนี้" popId="pl-info-goals-sum">
              <p>สรุปความคืบหน้าของเป้าหมาย (สถานะ ณ ปัจจุบัน ไม่ขึ้นกับเดือนที่ดู) ดูรายละเอียด แก้ไข หรือเพิ่มเป้าหมายได้ที่แท็บ “เป้าหมายออม”</p>
            </InfoTitle>
            {data.goals.length > 0 && (
              <button type="button" className="pl-cap" data-goal-sum-all onClick={() => pickTab('goals')}>
                {data.goals.length > 3 ? `ดูทั้งหมด ${data.goals.length}` : 'ดูรายละเอียด'}<IconArrow />
              </button>
            )}
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
            </>
          )}
        </div>

        {/* ===== 4 สรุปรายการผ่อนเดือนนี้ (แบบย่อ) กดเพื่อไปแท็บรายการผ่อน ===== */}
        {inst && (
          <div className="card" data-plan-inst-summary>
            <div className="pl-card-head">
              <InfoTitle title={<><span className="pl-ti"><IconCard size={18} /></span>ผ่อนเดือนนี้</>} label="คำอธิบายส่วนนี้" popId="pl-info-inst-sum">
                <p>งวดผ่อนที่ครบกำหนดเดือนนี้ (รวมที่ค้างชำระ) ไม่ขึ้นกับเดือนที่ดู จัดการรายการผ่อนได้ที่แท็บ “รายการผ่อน”</p>
              </InfoTitle>
              {inst.plans.length > 0 && (
                <button type="button" className="pl-cap" data-inst-sum-all onClick={() => { pickTab('installments'); setInstView('active'); }}>ดูรายการผ่อน<IconArrow /></button>
              )}
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
              </>
            )}
          </div>
        )}
        </div>
      </div>
      </>
      )}
      </div>
      )}

      {tab === 'goals' && (
        <div role="tabpanel" id="pl-panel-goals" aria-labelledby="pl-tab-goals" data-plan-panel="goals">
          {goalView === 'done' ? (
            (data.achievements || []).length === 0 ? (
              <div className="card pl-goal-empty" data-ach-empty>
                <span className="pl-soon-icon gold" aria-hidden="true"><IconTrophy size={26} /></span>
                <p>ยังไม่มีเป้าหมายที่ออมสำเร็จ เมื่อยอด “ออมแล้ว” ถึงเป้า ระบบจะย้ายมาเก็บไว้ที่นี่ให้อัตโนมัติ</p>
              </div>
            ) : (
              <>
                {/* ยอดรวม: แสดงเฉพาะเมื่อมีตั้งแต่ 2 เป้าหมาย (จำนวนอยู่ที่ปุ่มแท็บ / เป้าหมายเดียวยอดอยู่บนการ์ดแล้ว) */}
                {data.achievements.length >= 2 && (
                  <div className="pl-ach-total" data-ach-summary>รวมออมสำเร็จ <b>{baht(data.achievements.reduce((t, a) => t + a.target_amount, 0))}</b></div>
                )}
                <div className="pl-goal-grid pl-ach-grid" data-achievements>
                  {data.achievements.map((a) => {
                    const pill = timingPill(a.early_days);
                    return (
                      <div className="card pl-ach" key={a.goal_id} data-ach-item>
                        <div className="pl-ach-menu-wrap" data-ach-menu-wrap>
                          <button type="button" className="pl-ach-more" aria-label={`ตัวเลือกของ ${a.name}`} aria-expanded={achMenu === a.goal_id} data-ach-more onClick={() => setAchMenu(achMenu === a.goal_id ? null : a.goal_id)}>⋯</button>
                          {achMenu === a.goal_id && (
                            <div className="pl-ach-menu" role="menu">
                              <button type="button" role="menuitem" data-ach-reopen onClick={() => { setAchMenu(null); setGoalModal({ goal: a, reopen: true }); }}>ย้ายกลับไปกำลังออม</button>
                              <button type="button" role="menuitem" className="danger" data-ach-del onClick={() => { setAchMenu(null); setConfirmDel(a.goal_id); }}>ลบออกจากประวัติ</button>
                            </div>
                          )}
                        </div>
                        <div className="pl-ach-name">{a.name}</div>
                        <div className="pl-ach-sub">สำเร็จ {thaiDate(a.completed_at)}</div>
                        <div className="pl-ach-pct">
                          <span className="pl-ach-done"><span className="pl-ach-trophy" aria-hidden="true"><IconTrophy size={15} /></span><b>{baht(a.target_amount)}</b></span>
                          <span className={`pl-ach-pill ${pill.cls}`} data-ach-timing>{pill.text}</span>
                        </div>
                        <div className="pl-bar pl-ach-bar" aria-hidden="true"><i style={{ width: '100%' }} /></div>
                        <dl className="pl-goal-facts pl-ach-facts">
                          <div><dt>ระยะเวลา</dt><dd>{a.duration_days < 1 ? 'ภายในวันเดียว' : spanText(a.duration_days)}</dd></div>
                          <div><dt>ช่วงที่ออม</dt><dd>{a.started_at ? `${thaiDate(a.started_at)} – ${thaiDate(a.completed_at)}` : thaiDate(a.completed_at)}</dd></div>
                          {a.target_date && <div><dt>กำหนดเดิม</dt><dd>{thaiDate(a.target_date)}</dd></div>}
                        </dl>
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
            <div className="pl-cele-em" aria-hidden="true"><IconParty size={44} /></div>
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
