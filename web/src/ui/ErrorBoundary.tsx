import { tr } from '../lib/i18n';
import { Component, type ReactNode } from 'react';
import { Card, EmptyState } from './Display';
import { Button } from './Button';

/** يمنع تعطل شاشة واحدة من إسقاط البوابة كلها */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    console.error(error);
    // بعد نشر نسخة جديدة تطلب الصفحة المفتوحة جزءاً قديماً لم يعد موجوداً: إعادة تحميل واحدة تجلب النسخة الجديدة
    if (/dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message)) {
      let last = 0;
      try { last = Number(sessionStorage.getItem('kmk.chunkReload') || 0); } catch { /* لا تخزين */ }
      if (Date.now() - last > 60_000) {
        try { sessionStorage.setItem('kmk.chunkReload', String(Date.now())); } catch { /* لا تخزين */ }
        location.reload();
      }
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card>
        <EmptyState title={tr("حدث خطأ في عرض هذه الشاشة")} body={tr("جرّب إعادة التحميل. إن تكرر الخطأ أبلغ مدير النظام بما كنت تفعله.")}
          action={<Button variant="primary" icon="refresh" onClick={() => location.reload()}>{tr("إعادة التحميل")}</Button>} />
      </Card>
    );
  }
}
