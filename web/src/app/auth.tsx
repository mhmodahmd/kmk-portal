import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, onApiEvent, session, tryResume } from '../lib/api';
import type { Roles, SessionResult, User } from '../lib/types';

interface AuthState {
  status: 'loading' | 'out' | 'in';
  user: User | null;
  roles: Roles;
  updateRequired: boolean;
  signIn: (r: SessionResult) => void;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);
const USER_KEY = 'kmk.user';

function cachedUser(): { user: User; roles: Roles } | null {
  try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function cacheUser(v: { user: User; roles: Roles } | null) {
  try { v ? localStorage.setItem(USER_KEY, JSON.stringify(v)) : localStorage.removeItem(USER_KEY); } catch { /* تجاهل */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const cached = session.token ? cachedUser() : null;
  // إن كانت هناك جلسة محفوظة نعرض الواجهة فوراً ونتحقق في الخلفية
  const [state, setState] = useState<{ status: AuthState['status']; user: User | null; roles: Roles }>(
    cached ? { status: 'in', ...cached } : { status: session.token || session.deviceToken ? 'loading' : 'out', user: null, roles: {} }
  );
  const [updateRequired, setUpdateRequired] = useState(false);

  const signIn = useCallback((r: SessionResult) => {
    session.save(r);
    cacheUser({ user: r.user, roles: r.roles });
    setState({ status: 'in', user: r.user, roles: r.roles });
  }, []);

  const signOut = useCallback(async () => {
    try { await api('auth.logout'); } catch { /* الجلسة قد تكون منتهية أصلاً */ }
    session.clear(true);
    cacheUser(null);
    qc.clear();
    setState({ status: 'out', user: null, roles: {} });
  }, [qc]);

  const setUser = useCallback((u: User) => {
    setState((s) => { cacheUser({ user: u, roles: s.roles }); return { ...s, user: u }; });
  }, []);

  useEffect(() => onApiEvent((e) => {
    if (e === 'logout') { cacheUser(null); qc.clear(); setState({ status: 'out', user: null, roles: {} }); }
    if (e === 'update') setUpdateRequired(true);
  }), [qc]);

  // التحقق من الجلسة عند الفتح
  useEffect(() => {
    let alive = true;
    (async () => {
      const out = () => { session.clear(false); cacheUser(null); if (alive) setState({ status: 'out', user: null, roles: {} }); };
      if (!session.token && !(await tryResume())) return out();
      const me = async () => {
        const r = await api<{ user: User; roles: Roles }>('auth.me');
        if (!alive) return;
        cacheUser(r);
        setState({ status: 'in', user: r.user, roles: r.roles });
      };
      try {
        await me();
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== 'SESSION_EXPIRED') {
          // خطأ شبكة: نبقى على النسخة المحفوظة إن وُجدت
          if (!cached) out();
          return;
        }
        if (await tryResume()) { try { await me(); return; } catch { /* يكمل للخروج */ } }
        out();
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={{ ...state, updateRequired, signIn, signOut, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
