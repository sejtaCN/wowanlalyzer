import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('.'),
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@learn': r('../../packages/learning-core/src/index.ts'),
    },
  },
  build: {
    outDir: r('../../dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    target: 'es2022',
  },
  server: { port: 5273, host: '127.0.0.1' },
});
