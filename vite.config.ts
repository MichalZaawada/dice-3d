// Development server for the examples and the browser test fixture.
// The pages import the built packages (`npm run build:packages`) exactly like consumers do.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
  logLevel: 'warn',
});
