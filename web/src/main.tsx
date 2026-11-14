import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './app/App';
import { AuthProvider } from './app/auth';
import { ToastProvider } from './ui/Overlay';
import { ApiError, CLIENT_VERSION } from './lib/api';
import './index.css';
import { applyLang, LANG } from './lib/i18n';

applyLang();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // نحتفظ بآخر بيانات يوماً لعرضها فوراً عند الفتح
      retry: (count, err) => count < 2 && !(err instanceof ApiError && ['FORBIDDEN', 'SESSION_EXPIRED', 'BAD_REQUEST', 'NO_EMPLOYEE', 'NOT_FOUND'].includes(err.code)),
      refetchOnWindowFocus: true
    }
  }
});

let storage: Storage | undefined;
try { storage = window.localStorage; } catch { storage = undefined; }
const persister = createSyncStoragePersister({ storage, key: 'kmk.cache' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24, buster: CLIENT_VERSION + '-' + LANG }}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
}
