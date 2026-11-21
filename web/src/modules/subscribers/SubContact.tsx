import { useEffect, useMemo, useState } from 'react';
import { tr } from '../../lib/i18n';
import { api } from '../../lib/api';
import { errorText, useAction, useApi } from '../../lib/useApi';
import { Button, IconAction } from '../../ui/Button';
import { Select, TextInput, Textarea } from '../../ui/Field';
import { Segmented } from '../../ui/Controls';
import { Dialog, useToast } from '../../ui/Overlay';
import { Loader } from '../../ui/Display';
import { KEYS, useSubLookups, useTemplates, type Channel, type Reply, type SubRow, type Template } from './shared';

type Target = Pick<SubRow, 'id' | 'ref' | 'name' | 'hasMobile' | 'hasEmail' | 'optOut' | 'forgotten' | 'suggestKind' | 'lastContactId' | 'reply' | 'nextFollowUpAt'>;
type Mode = 'whatsapp' | 'email' | 'log' | 'reply';
interface Preview { subject: string; body: string; templateId: string; kind: string; missingLink: boolean }

/** القالب المقترح لقناة: نوع الأيام المتبقية، وإلا أول قالب نشط */
function pickTemplate(list: Template[], channel: 'whatsapp' | 'email', kind: string) {
  const act = list.filter((t) => t.channel === channel && t.active);
  return (act.find((t) => t.kind === kind) || act[0])?.id || '';
}

/** أزرار التواصل مع مشترك ونوافذها. compact: أيقونات للجداول */
export function ContactButtons({ s, compact }: { s: Target; compact?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const has = !!s.id && !s.forgotten;
  const why = s.optOut ? tr("أوقف الرسائل") : '';
  const items: { m: Mode; icon: 'chat' | 'mail' | 'phone' | 'edit'; label: string; disabled: boolean; hint?: string }[] = [
    { m: 'whatsapp', icon: 'chat', label: tr("واتساب"), disabled: !has || !s.hasMobile || s.optOut, hint: why || (!s.hasMobile ? tr("لا جوال") : '') },
    { m: 'email', icon: 'mail', label: tr("بريد"), disabled: !has || !s.hasEmail || s.optOut, hint: why || (!s.hasEmail ? tr("لا بريد") : '') },
    { m: 'log', icon: 'phone', label: tr("تسجيل مكالمة"), disabled: !has },
    { m: 'reply', icon: 'edit', label: tr("تحديث الرد"), disabled: !has || !s.lastContactId }
  ];
  // أحداث React تعبر النوافذ (portal) إلى السطر الأب، فتُوقف هنا حتى لا يفتح الضغط داخل النافذة صفحة المشترك
  return (
    <span className="inline-flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {items.map((it) => compact
        ? <IconAction key={it.m} icon={it.icon} label={it.hint ? tr("{0} ({1})", it.label, it.hint) : it.label} disabled={it.disabled} onClick={() => setMode(it.m)} />
        : <Button key={it.m} size="sm" variant={it.m === 'whatsapp' ? 'primary' : 'secondary'} icon={it.icon} disabled={it.disabled} onClick={() => setMode(it.m)}>{it.label}</Button>)}
      {mode === 'whatsapp' && <WhatsAppDialog s={s} onClose={() => setMode(null)} />}
      {mode === 'email' && <EmailDialog s={s} onClose={() => setMode(null)} />}
      {mode === 'log' && <LogDialog s={s} onClose={() => setMode(null)} />}
      {mode === 'reply' && s.lastContactId && <ReplyDialog id={s.lastContactId} reply={s.reply} next={s.nextFollowUpAt} onClose={() => setMode(null)} />}
    </span>
  );
}

/** اختيار القالب ومعاينته بمتغيرات المشترك، والنص قابل للتعديل */
function useComposer(s: Target, channel: 'whatsapp' | 'email') {
  const tq = useTemplates();
  const list = useMemo(() => (tq.data || []).filter((t) => t.channel === channel && t.active), [tq.data, channel]);
  const [tplId, setTplId] = useState<string | null>(null);
  const chosen = tplId ?? (tq.data ? pickTemplate(tq.data, channel, s.suggestKind) : null);
  const pv = useApi<Preview>('sub.message.preview', { ref: s.ref, templateId: chosen || undefined }, { enabled: chosen != null && chosen !== '', staleTime: 0, gcTime: 0 });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { if (pv.data) { setSubject(pv.data.subject); setBody(pv.data.body); } }, [pv.data]);
  useEffect(() => { if (chosen === '') { setSubject(''); setBody(''); } }, [chosen]);
  const select = (
    <Select label={tr("القالب")} value={chosen || ''} onChange={(e) => setTplId(e.target.value)}
      options={[...list.map((t) => ({ value: t.id, label: tr("{0} · {1}", t.name, t.kindLabel) })), { value: '', label: tr("بلا قالب (نص حر)") }]} />
  );
  const loading = !tq.data || (!!chosen && pv.isPending);
  return { chosen: chosen || '', kind: chosen ? pv.data?.kind || 'manual' : 'manual', subject, setSubject, body, setBody, select, loading, missingLink: !!pv.data?.missingLink };
}

function LinkHint({ show }: { show: boolean }) {
  return show ? <p className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn">{tr("رابط التجديد غير محدد في الإعدادات، فحُذف سطره من الرسالة.")}</p> : null;
}

/** واتساب: تجهيز النص، فتح المحادثة، ثم سؤال الموظف «هل أرسلت الرسالة؟» قبل التسجيل */
function WhatsAppDialog({ s, onClose }: { s: Target; onClose: () => void }) {
  const toast = useToast();
  const c = useComposer(s, 'whatsapp');
  const [step, setStep] = useState<'compose' | 'confirm'>('compose');
  const [opening, setOpening] = useState(false);
  const log = useAction('sub.contact.log', { invalidate: KEYS, success: tr("سُجّل التواصل بانتظار الرد"), onSuccess: onClose });
  const open = async () => {
    // تُفتح النافذة داخل الضغطة نفسها حتى لا يحجبها المتصفح، ثم يُوضع الرابط بعد رد الخادم
    const w = window.open('', '_blank');
    setOpening(true);
    try {
      const r = await api<{ url: string }>('sub.message.whatsapp', { ref: s.ref, templateId: c.chosen || undefined, body: c.body });
      if (w) w.location.href = r.url; else location.href = r.url;
      setStep('confirm');
    } catch (e) { w?.close(); toast(errorText(e), 'bad'); } finally { setOpening(false); }
  };
  if (step === 'confirm') {
    return (
      <Dialog open onClose={onClose} title={tr("هل أرسلت الرسالة؟")}
        footer={<>
          <Button variant="primary" className="flex-1" loading={log.isPending} onClick={() => log.mutate({ ref: s.ref, channel: 'whatsapp', templateId: c.chosen || undefined, kind: c.kind })}>{tr("نعم، أرسلتها")}</Button>
          <Button variant="ghost" onClick={() => { toast(tr("لم يُسجَّل تواصل")); onClose(); }}>{tr("لا")}</Button>
        </>}>
        <p className="m-0">{tr("إن أرسلت الرسالة إلى {0} من واتساب يُسجَّل تواصل بحالة «بانتظار الرد».", s.name || tr("المشترك"))}</p>
        <Button variant="ghost" size="sm" icon="chat" onClick={() => setStep('compose')}>{tr("رجوع إلى الرسالة")}</Button>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={onClose} title={tr("رسالة واتساب إلى {0}", s.name || tr("المشترك"))} wide
      footer={<><Button variant="primary" className="flex-1" icon="chat" loading={opening} disabled={c.loading || !c.body.trim()} onClick={open}>{tr("فتح واتساب")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      {c.select}
      {c.loading ? <Loader /> : <Textarea label={tr("نص الرسالة")} rows={8} value={c.body} onChange={(e) => c.setBody(e.target.value)} />}
      <LinkHint show={c.missingLink} />
      <p className="m-0 text-[12px] text-muted">{tr("تُفتح المحادثة من رقم واتساب الأعمال والرسالة جاهزة، وترسلها أنت. فتحها يكشف الرقم فيُسجَّل في سجل العمليات.")}</p>
    </Dialog>
  );
}

/** بريد بقالب: معاينة وتعديل ثم إرسال فوري من حساب البوابة */
function EmailDialog({ s, onClose }: { s: Target; onClose: () => void }) {
  const toast = useToast();
  const c = useComposer(s, 'email');
  const send = useAction<Record<string, unknown>, { status: string; error: string }>('sub.message.email', {
    invalidate: KEYS, silentError: false,
    success: (r) => (r.status === 'sent' ? tr("أُرسل البريد") : ''),
    onSuccess: (r) => { if (r.status === 'sent') onClose(); else toast(tr("تعذّر إرسال البريد: {0}", r.error), 'bad'); }
  });
  return (
    <Dialog open onClose={onClose} title={tr("بريد إلى {0}", s.name || tr("المشترك"))} wide
      footer={<><Button variant="primary" className="flex-1" icon="mail" loading={send.isPending} disabled={c.loading || !c.subject.trim() || !c.body.trim()}
        onClick={() => send.mutate({ ref: s.ref, templateId: c.chosen || undefined, subject: c.subject, body: c.body })}>{tr("إرسال")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      {c.select}
      {c.loading ? <Loader /> : (
        <>
          <TextInput label={tr("العنوان")} value={c.subject} onChange={(e) => c.setSubject(e.target.value)} />
          <Textarea label={tr("نص الرسالة")} rows={9} value={c.body} onChange={(e) => c.setBody(e.target.value)} />
        </>
      )}
      <LinkHint show={c.missingLink} />
      <p className="m-0 text-[12px] text-muted">{tr("يُرسل من حساب Google للبوابة، ويُلحق به رابط «إيقاف الرسائل» تلقائياً.")}</p>
    </Dialog>
  );
}

/** حقول حالة الرد والملاحظة وموعد المتابعة */
function ReplyFields({ reply, setReply, note, setNote, next, setNext, required }: {
  reply: string; setReply: (v: string) => void; note: string; setNote: (v: string) => void; next: string; setNext: (v: string) => void; required?: boolean;
}) {
  const L = useSubLookups().data;
  return (
    <>
      <Select label={tr("حالة الرد")} required={required} value={reply} onChange={(e) => setReply(e.target.value)}
        options={[{ value: '', label: tr("اختر") }, ...(L?.replies || []).map((r) => ({ value: r.id, label: r.label }))]} />
      {reply === 'optout' && <p className="m-0 text-[13px] text-warn">{tr("سيُوقَف إرسال الرسائل لهذا المشترك.")}</p>}
      <TextInput label={tr("موعد المتابعة التالية")} type="date" value={next} onChange={(e) => setNext(e.target.value)} hint={tr("اختياري. يظهر في «متابعة متأخرة» إذا مضى دون إغلاق")} />
      <Textarea label={tr("ملاحظة")} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </>
  );
}

/** تسجيل مكالمة أو تواصل تم خارج النظام (صادر أو وارد) */
function LogDialog({ s, onClose }: { s: Target; onClose: () => void }) {
  const L = useSubLookups().data;
  const [channel, setChannel] = useState<Channel>('call');
  const [dir, setDir] = useState<'out' | 'in'>('out');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const log = useAction('sub.contact.log', { invalidate: KEYS, success: tr("سُجّل التواصل"), onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={tr("تسجيل تواصل مع {0}", s.name || tr("المشترك"))}
      onSubmit={() => log.mutate({ ref: s.ref, channel, direction: dir, replyStatus: reply, note, nextFollowUpAt: next })}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={log.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <div className="flex flex-wrap gap-3">
        <Select label={tr("القناة")} className="w-40" value={channel} onChange={(e) => setChannel(e.target.value as Channel)} options={(L?.channels || []).map((c) => ({ value: c.id, label: c.label }))} />
        <div className="flex flex-col justify-end"><Segmented label={tr("الاتجاه")} value={dir} onChange={setDir} options={[{ value: 'out', label: tr("منّا") }, { value: 'in', label: tr("من المشترك") }]} /></div>
      </div>
      <ReplyFields reply={reply} setReply={setReply} note={note} setNote={setNote} next={next} setNext={setNext} required />
    </Dialog>
  );
}

/** تحديث حالة الرد على تواصل */
export function ReplyDialog({ id, reply: r0, next: n0, note: note0, onClose }: { id: string; reply: Reply | ''; next: string; note?: string; onClose: () => void }) {
  const [reply, setReply] = useState<string>(r0 && r0 !== 'waiting' ? r0 : '');
  const [note, setNote] = useState(note0 || '');
  const [next, setNext] = useState(n0 || '');
  const upd = useAction('sub.contact.update', { invalidate: KEYS, success: tr("حُدّث الرد"), onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={tr("تحديث الرد")}
      onSubmit={() => upd.mutate({ id, replyStatus: reply, note, nextFollowUpAt: next })}
      footer={<><Button type="submit" variant="primary" className="flex-1" loading={upd.isPending}>{tr("حفظ")}</Button><Button variant="ghost" onClick={onClose}>{tr("تراجع")}</Button></>}>
      <ReplyFields reply={reply} setReply={setReply} note={note} setNote={setNote} next={next} setNext={setNext} required />
    </Dialog>
  );
}
