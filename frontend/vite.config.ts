import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** The one-file demo has no server for /manifest or icons: inline the icon, drop the rest. */
function demoHead(): Plugin {
  return {
    name: 'demo-head',
    transformIndexHtml(html) {
      const svg = readFileSync(new URL('./public/icon.svg', import.meta.url), 'utf8');
      return html
        .replace('<title>Surajlogistic · To every direction</title>', '<title>Surajlogistic Demo</title>')
        .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`)
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(/\s*<link rel="manifest"[^>]*>/, '');
    },
  };
}

// `vite build --mode demo` produces one self-contained HTML file that runs the whole
// product in the browser on demo data (no API needed) — used for sales demos.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [demoHead(), viteSingleFile()] : [])],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : process.env.VITE_DEMO ?? '') },
  publicDir: mode === 'demo' ? false : 'public',
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', chunkSizeWarningLimit: 1500, assetsInlineLimit: mode === 'demo' ? 100_000_000 : 4096 },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: true } },
  },
}));
