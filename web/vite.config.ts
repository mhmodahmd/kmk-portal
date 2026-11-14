import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite';
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
export default defineConfig(({ command, mode }) => {
  // نسخة الإنتاج بلا عنوان خادم ستعمل بالخادم الوهمي: نوقف البناء بدل نشرها بالخطأ
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && mode === 'production' && (!env.VITE_API_URL || env.VITE_API_URL === 'mock')) {
    throw new Error('VITE_API_URL is missing: set the API_URL repository variable before building for production.');
  }
  return config;
});

const config = {
  base: '/kmk-portal/',
  plugins: [react(), tailwindcss(), cspPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600
  }
} satisfies UserConfig;
