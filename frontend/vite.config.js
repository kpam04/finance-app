import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// เรียก /api/... จาก frontend (พอร์ต 5173) แล้วส่งต่อไป backend (พอร์ต 3000)
// ทำให้ไม่ต้องตั้งค่า CORS ในฝั่ง backend
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // เพิ่มบรรทัดนี้
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
