import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Офлайн-первый показ: никаких внешних CDN, всё уезжает в бандл.
export default defineConfig({
  base: './',
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        // Three и постобработка — самые тяжёлые куски; выносим отдельно, чтобы
        // они кешировались независимо от кода презентации.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('postprocessing')) return 'postfx';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('three')) return 'three';
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
