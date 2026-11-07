import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Crumb Admin is its own app with its own Vercel project (Root Directory: admin).
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0' },
});
