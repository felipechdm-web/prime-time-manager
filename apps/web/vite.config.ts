import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const engine = fileURLToPath(new URL('../../supabase/functions/_shared/engine', import.meta.url));
const game = fileURLToPath(new URL('../../supabase/functions/_shared/game', import.meta.url));

// base './' funciona em qualquer endereço do GitHub Pages (usuario.github.io/nome-do-repo/)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@engine': engine,
      '@game': game,
    },
  },
  server: { fs: { allow: ['../..'] }, port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2500, sourcemap: false },
});
