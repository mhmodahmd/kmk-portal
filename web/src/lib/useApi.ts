import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { useToast } from '../ui/Overlay';

/** قراءة من الخادم. مفتاح التخزين = [الإجراء, المدخلات] */
export function useApi<T>(action: string, payload: Record<string, unknown> = {}, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: [action, payload], queryFn: () => api<T>(action, payload), ...opts });
}

/**
 * إجراء يغيّر البيانات ثم يحدّث القراءات المرتبطة.
 * invalidate: أسماء الإجراءات التي تُعاد قراءتها بعد النجاح.
 */
export function useAction<P = Record<string, unknown>, R = unknown>(action: string, opts: { invalidate?: string[]; success?: string | ((r: R) => string); silentError?: boolean; onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<R, Error, P>({
    mutationFn: (p: P) => api<R>(action, p),
    onSuccess: (r) => {
      ['home.summary', 'inbox.list', ...(opts.invalidate || [])].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast(msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => { if (!opts.silentError) toast(e instanceof ApiError ? e.message : 'تعذّر تنفيذ الإجراء.', 'bad'); }
  });
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e ? 'تعذّر الاتصال بالخادم.' : '');
