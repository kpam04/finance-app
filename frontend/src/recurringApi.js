// ฟังก์ชันเรียก API ของระบบรายการที่เกิดซ้ำ
// ใช้ตัวช่วยกลางจาก api.js (แนบ token และจัดการ error ให้เหมือนหน้าอื่น)
import { api } from './api.js';

export const getRecurring = async () => (await api.get('/recurring')).data;

export const createRecurring = async (body) => (await api.post('/recurring', body)).data;

export const updateRecurring = async (id, body) => (await api.put(`/recurring/${id}`, body)).data;

export const deleteRecurring = async (id) => (await api.delete(`/recurring/${id}`)).data;

// รายจ่ายที่น่าจะเป็นรายการประจำ (จดเองทุกเดือน ยังไม่ได้ตั้ง) / ตอบ "ไม่ใช่"
export const getRecurringSuggestions = async () => (await api.get('/recurring/suggestions')).data;

export const dismissRecurringSuggestion = async (key) => (await api.post('/recurring/suggestions/dismiss', { key })).data;

export const runRecurringDue = async () => (await api.post('/recurring/run-due')).data;

// รวมหมวดที่ซ่อนด้วย เพื่อให้กฎเดิมที่ใช้หมวดซึ่งถูกซ่อนไปแล้วยังแสดงชื่อหมวดได้ (ช่องเลือกหมวดจะไม่แสดงหมวดที่ซ่อนให้เลือกใหม่)
export const getCategoriesForRecurring = () => api.getCategories({ include_hidden: 1 });