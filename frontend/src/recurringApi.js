// ฟังก์ชันเรียก API ของระบบรายการที่เกิดซ้ำ
// ใช้ตัวช่วยกลางจาก api.js (แนบ token และจัดการ error ให้เหมือนหน้าอื่น)
import { api } from './api.js';

export const getRecurring = async () => (await api.get('/recurring')).data;

export const createRecurring = async (body) => (await api.post('/recurring', body)).data;

export const updateRecurring = async (id, body) => (await api.put(`/recurring/${id}`, body)).data;

export const deleteRecurring = async (id) => (await api.delete(`/recurring/${id}`)).data;

export const runRecurringDue = async () => (await api.post('/recurring/run-due')).data;

export const getCategoriesForRecurring = () => api.getCategories();