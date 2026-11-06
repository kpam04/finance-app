// ตัวกลางเรียก API ทั้งหมดของ backend
// ทุกคำขอจะแนบ token (ถ้ามี) และแปลงข้อผิดพลาดเป็น Error ที่มีข้อความภาษาไทยจาก backend

const TOKEN_KEY = 'finance_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = 'GET', body, params, signal } = {}) {
  let url = `/api${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const aborted = new Error('ยกเลิกแล้ว');
      aborted.name = 'AbortError';
      throw aborted;
    }
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (ตรวจว่า backend รันอยู่ที่พอร์ต 3000)');
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ไม่มี body */
  }

     // token ใช้ไม่ได้/บัญชีถูกระงับ: เก็บข้อความไว้แสดงที่หน้าเข้าสู่ระบบ (ไม่เก็บกรณีตัวล็อกอินเอง)
     const code = json && json.code;
     if ((code === 'SESSION_INVALID' || code === 'ACCOUNT_SUSPENDED') && path !== '/auth/login') {
       try { sessionStorage.setItem('finance_notice', json.message); } catch { /* ignore */ }
     }
     if (res.status === 401 || code === 'ACCOUNT_SUSPENDED') {
       clearToken();
       window.dispatchEvent(new Event('auth:logout'));
     }
  if (!res.ok || (json && json.success === false)) {
    const err = new Error((json && json.message) || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status;
    err.code = json && json.code; // รหัสข้อผิดพลาดจากหลังบ้าน (เช่น HIDDEN_EXISTS) ใช้แยกกรณีพิเศษ
    err.data = json;
    throw err;
  }
  return json;
}

export const api = {
  // auth
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  profile: () => request('/auth/profile'),

  updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: data }),
  deleteAccount: (password) => request('/auth/account', { method: 'DELETE', body: { password } }),

  // categories
  getCategories: (params) => request('/categories', { params }), // params: { include_hidden: 1 } = รวมหมวดที่ซ่อน
  getMyCategories: () => request('/categories/mine'),
  createCategory: (data) => request('/categories', { method: 'POST', body: data }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: data }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  restoreCategory: (id) => request(`/categories/${id}/restore`, { method: 'POST' }),

  // ผู้ช่วย AI (ข้อความถูกส่งไปบริการ AI ภายนอกเมื่อผู้ใช้เปิดใช้เท่านั้น)
  aiStatus: () => request('/ai/status'),
  aiConsent: (data) => request('/ai/consent', { method: 'PUT', body: data }),
  aiParseText: (data, signal) => request('/ai/parse-text', { method: 'POST', body: data, signal }), // signal: ยกเลิกได้ (ผู้ใช้กดยกเลิก หรือรอเกินเวลา)
  aiFeedback: (eventId, data) => request(`/ai/events/${eventId}/feedback`, { method: 'PUT', body: data }),
  aiParseReceipt: (data, signal) => request('/ai/parse-receipt', { method: 'POST', body: data, signal }), // ส่งรูปใบเสร็จ (ย่อแล้ว) ให้ AI อ่าน

  // วางแผน: วิเคราะห์พฤติกรรม + เป้าหมายการออม + ให้ AI เขียนคำแนะนำจากตัวเลขสรุป (ผู้ใช้กดเอง)
  getPlanOverview: (month) => request('/plan/overview', { params: { month } }),
  getPlanSummary: () => request('/plan/summary'),
  planAdvice: (signal) => request('/plan/advice', { method: 'POST', body: {}, signal }),
  planAdviceFeedback: (data) => request('/plan/advice/feedback', { method: 'PUT', body: data }),
  deletePlanAdvice: (month) => request('/plan/advice', { method: 'DELETE', params: { month } }),
  createGoal: (data) => request('/plan/goals', { method: 'POST', body: data }),
  updateGoal: (id, data) => request(`/plan/goals/${id}`, { method: 'PUT', body: data }),
  deleteGoal: (id) => request(`/plan/goals/${id}`, { method: 'DELETE' }),
  planSimulate: (adjustments) => request('/plan/simulate', { method: 'POST', body: { adjustments } }),

  // transactions
  getTransactions: (params) => request('/transactions', { params }),
  createTransaction: (data) => request('/transactions', { method: 'POST', body: data }),
  updateTransaction: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: data }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),

    // ตัวเรียกทั่วไป (ใช้กับ Dashboard.jsx)
    // ตัวเรียกทั่วไปแบบ axios (คืน { data: <JSON ทั้งก้อน> }) ใช้กับ Dashboard.jsx
  get: async (path, config) => ({
    data: await request(path, { params: config && config.params }),
  }),
  post: async (path, body) => ({ data: await request(path, { method: 'POST', body }) }),
  put: async (path, body) => ({ data: await request(path, { method: 'PUT', body }) }),
  delete: async (path) => ({ data: await request(path, { method: 'DELETE' }) }),

  // dashboard / budgets / notifications
  getDashboardSummary: (params) => request('/dashboard/summary', { params }),
  getDashboardInsights: (params) => request('/dashboard/insights', { params }),
  getBudgets: (params) => request('/budgets', { params }),
  createBudget: (data) => request('/budgets', { method: 'POST', body: data }),
  deleteBudget: (id) => request(`/budgets/${id}`, { method: 'DELETE' }),
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) =>
    request('/notifications', { method: 'PUT', body: { notification_id: id } }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),
};
