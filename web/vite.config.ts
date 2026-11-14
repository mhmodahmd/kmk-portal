import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// سياسة أمان المحتوى في نسخة الإنتاج فقط (خادم التطوير يحتاج سكربتات مضمّنة)
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'kmk-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    }
  };
}

// GitHub Pages يخدم المشروع تحت /kmk-portal/
export default defineConfig({
  base: '/kmk-portal/',
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600
  }
});
