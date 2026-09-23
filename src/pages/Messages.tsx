import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  MessageSquare,
  Sparkles,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { loadUsage, canSendMessage, type UsageSnapshot } from '../lib/subscription';
import { useToast } from '../lib/toast-context';
import { getCenterDebtors } from '../lib/debt';
import type { Student, Group, StudentMessage, MessageType } from '../types/database';
import {
  saveMessageRecord,
  saveMessageBatch,
  fetchMessageHistory,
  getMessageTemplates,
  type SendMessagePayload,
} from '../services/student-messages';
import { generateStudentMessage } from '../services/gemini';

type Debtor = { student_id: string; full_name: string; debt: number; paid: number; expected: number };

export default function Messages() {
  const { t, i18n } = useTranslation();
  const { center, subscription, user } = useAuth();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [history, setHistory] = useState<StudentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [targetType, setTargetType] = useState<'single' | 'group' | 'debtors' | 'all'>('single');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('debt_reminder');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');

  useEffect(() => {
    if (!center?.id) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setPageError('');
      try {
        const [{ data: sData, error: sErr }, { data: gData }, debtList, hist, usageSnap] = await Promise.all([
          supabase.from('students').select('*').eq('center_id', center!.id).order('full_name'),
          supabase.from('groups').select('*').eq('center_id', center!.id).eq('status', 'active'),
          getCenterDebtors(center!.id),
          fetchMessageHistory(center!.id),
          loadUsage(center!.id, subscription),
        ]);

        if (cancelled) return;
        if (sErr) setPageError(sErr.message);
        setStudents((sData as Student[]) || []);
        setGroups((gData as Group[]) || []);
        setDebtors((debtList as Debtor[]) || []);
        setHistory(hist);
        setUsage(usageSnap);
      } catch (err) {
        console.error('Failed to load message data', err);
        setPageError(err instanceof Error ? err.message : 'Yuklash xatosi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [center?.id, subscription]);

  const refreshHistory = async () => {
    if (!center?.id) return;
    setHistoryLoading(true);
    try {
      const hist = await fetchMessageHistory(center.id);
      setHistory(hist);
      const snap = await loadUsage(center.id, subscription);
      setUsage(snap);
    } finally {
      setHistoryLoading(false);
    }
  };

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId),
    [students, selectedStudentId]
  );

  const selectedDebtor = useMemo(
    () => debtors.find((d) => d.student_id === selectedStudentId),
    [debtors, selectedStudentId]
  );

  const templates = useMemo(() => getMessageTemplates(i18n.language), [i18n.language]);

  const applyTemplate = (templateId: string) => {
    const item = templates.find((tmp) => tmp.id === templateId);
    if (!item) return;
    setMessageType(item.type);
    const studentName = selectedStudent?.full_name || "O‘quvchi";
    const centerName = center?.name || 'Velia';
    const amount = selectedDebtor ? selectedDebtor.debt.toLocaleString() : '100,000';
    setContent(item.template(studentName, centerName, amount));
  };

  const handleAiGenerate = async () => {
    if (!center?.name) return;
    setGeneratingAi(true);
    try {
      const studentName = selectedStudent?.full_name || (targetType === 'group' ? "O‘quvchilar" : "O‘quvchi");
      const text = await generateStudentMessage({
        studentName,
        centerName: center.name,
        type: messageType,
        debt: selectedDebtor?.debt,
        locale: i18n.language,
      });
      setContent(text);
      toast(t('common.success'));
    } catch {
      toast(t('common.error'), 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const assertLimit = (count: number) => {
    if (!usage) return;
    const check = canSendMessage(usage);
    if (!check.ok) throw new Error(check.reason);
    const max = usage.plan.maxMessagesDay;
    if (max != null && max < 999999 && usage.messagesUsedDay + count > max) {
      throw new Error(`Bugungi xabar limiti: ${max}. ${count} ta yuborib bo‘lmaydi.`);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !center?.id) return;
    setSending(true);
    setPageError('');
    try {
      const base = {
        center_id: center.id,
        channel: 'in_app' as const,
        message_type: messageType,
        title: title.trim() || null,
        content: content.trim(),
        sent_by: user?.id || null,
      };

      if (targetType === 'single') {
        if (!selectedStudent) {
          toast(t('messages.selectStudent'), 'error');
          return;
        }
        assertLimit(1);
        const saved = await saveMessageRecord({
          ...base,
          student_id: selectedStudent.id,
          recipient_name: selectedStudent.full_name,
          recipient_phone: selectedStudent.phone,
          recipient_email: selectedStudent.email,
        });
        setHistory((prev) => [saved, ...prev]);
        toast('Xabar o‘quvchi panelida ko‘rinadi');
      } else if (targetType === 'debtors') {
        if (debtors.length === 0) {
          toast('Qarzdorlar mavjud emas', 'info');
          return;
        }
        assertLimit(debtors.length);
        const payloads: SendMessagePayload[] = debtors.map((item) => ({
          ...base,
          message_type: 'debt_reminder',
          student_id: item.student_id,
          recipient_name: item.full_name,
          content: content.replace(/\[O'quvchi\]|\{name\}/gi, item.full_name),
        }));
        const saved = await saveMessageBatch(payloads);
        setHistory((prev) => [...saved, ...prev]);
        toast(`${saved.length} ta qarzdorga xabar yuborildi`);
      } else if (targetType === 'group') {
        if (!selectedGroupId) {
          toast(t('messages.selectGroup'), 'error');
          return;
        }
        const { data: members, error: mErr } = await supabase
          .from('group_students')
          .select('student_id, students(id, full_name, phone, email)')
          .eq('group_id', selectedGroupId)
          .eq('status', 'active');
        if (mErr) throw mErr;
        const list = (members || [])
          .map((row: any) => {
            const st = Array.isArray(row.students) ? row.students[0] : row.students;
            return st as { id: string; full_name: string; phone?: string | null; email?: string | null } | null;
          })
          .filter(Boolean) as Array<{ id: string; full_name: string; phone?: string | null; email?: string | null }>;

        if (!list.length) {
          toast('Guruhda faol o‘quvchi yo‘q', 'info');
          return;
        }
        assertLimit(list.length);
        const saved = await saveMessageBatch(
          list.map((st) => ({
            ...base,
            message_type: 'announcement',
            student_id: st.id,
            group_id: selectedGroupId,
            recipient_name: st.full_name,
            recipient_phone: st.phone,
            recipient_email: st.email,
          }))
        );
        setHistory((prev) => [...saved, ...prev]);
        toast(`${saved.length} ta o‘quvchiga xabar yuborildi`);
      } else {
        const active = students.filter((s) => s.status === 'active');
        if (!active.length) {
          toast('Faol o‘quvchi yo‘q', 'info');
          return;
        }
        assertLimit(active.length);
        const saved = await saveMessageBatch(
          active.map((st) => ({
            ...base,
            message_type: 'announcement',
            student_id: st.id,
            recipient_name: st.full_name,
            recipient_phone: st.phone,
            recipient_email: st.email,
          }))
        );
        setHistory((prev) => [...saved, ...prev]);
        toast(`${saved.length} ta o‘quvchiga xabar yuborildi`);
      }

      setContent('');
      setTitle('');
      if (center?.id) {
        const snap = await loadUsage(center.id, subscription);
        setUsage(snap);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : t('common.error');
      setPageError(msg);
      toast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return history;
    const q = searchHistory.toLowerCase();
    return history.filter(
      (h) =>
        (h.recipient_name || '').toLowerCase().includes(q) ||
        (h.content || '').toLowerCase().includes(q)
    );
  }, [history, searchHistory]);

  if (loading) {
    return (
      <div className="empty-state">
        <RefreshCw size={32} className="animate-spin" color="var(--color-primary)" />
        <h3>{t('common.loading')}</h3>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <MessageSquare size={14} /> Velia Messenger
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
            {t('messages.title')}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Xabar faqat ilova ichida yuboriladi. Ota-ona va o‘quvchi panelida ko‘rinadi.
          </p>
        </div>
        {usage && (
          <div className="badge badge-info">
            Bugun: {usage.messagesUsedDay}
            {usage.plan.maxMessagesDay != null && usage.plan.maxMessagesDay < 999999
              ? ` / ${usage.plan.maxMessagesDay}`
              : ''}
          </div>
        )}
      </div>

      {pageError && (
        <div className="card" style={{ padding: 14, borderColor: 'var(--color-danger, #ef4444)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={18} />
          <div>
            <strong>Xatolik</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{pageError}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Agar 403 bo‘lsa: Supabase SQL Editor da <code>FIX_RLS_NOW.sql</code> ni ishga tushiring.
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '24px 20px', borderRadius: 20, boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Send size={18} color="var(--color-primary)" />
          {t('messages.sendNew')}
        </h2>

        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="input-label" style={{ marginBottom: 8 }}>{t('messages.recipientType')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              <button type="button" className={`btn btn-sm ${targetType === 'single' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('single')}>
                {t('messages.singleStudent')}
              </button>
              <button type="button" className={`btn btn-sm ${targetType === 'group' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('group')}>
                {t('messages.groupStudents')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetType === 'debtors' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setTargetType('debtors'); setMessageType('debt_reminder'); }}
              >
                {t('messages.debtorsOnly')} ({debtors.length})
              </button>
              <button type="button" className={`btn btn-sm ${targetType === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('all')}>
                {t('messages.allActive')} ({students.filter((s) => s.status === 'active').length})
              </button>
            </div>
          </div>

          {targetType === 'single' && (
            <div className="input-group">
              <label className="input-label">{t('messages.selectStudent')} *</label>
              <select className="input" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} required>
                <option value="">— {t('messages.selectStudent')} —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'group' && (
            <div className="input-group">
              <label className="input-label">{t('messages.selectGroup')} *</label>
              <select className="input" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} required>
                <option value="">— {t('messages.selectGroup')} —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">{t('messages.messageType')}</label>
              <select className="input" value={messageType} onChange={(e) => setMessageType(e.target.value as MessageType)}>
                <option value="debt_reminder">{t('messages.debtReminder')}</option>
                <option value="attendance_alert">{t('messages.attendanceAlert')}</option>
                <option value="praise">{t('messages.praise')}</option>
                <option value="announcement">{t('messages.announcement')}</option>
                <option value="general">{t('messages.general')}</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">{t('messages.template')}</label>
              <select className="input" defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
                <option value="">{t('messages.selectTemplate')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Sarlavha</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ixtiyoriy sarlavha" />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="input-label" style={{ marginBottom: 0 }}>{t('messages.messageContent')} *</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleAiGenerate} disabled={generatingAi} style={{ color: 'var(--color-primary)', fontWeight: 600, gap: 6 }}>
                {generatingAi ? (<><Loader2 size={14} className="animate-spin" />{t('messages.generating')}</>) : (<><Sparkles size={14} />{t('messages.generateWithAi')}</>)}
              </button>
            </div>
            <textarea
              className="input"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('messages.placeholder')}
              required
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={sending || !content.trim()}>
              {sending ? (<><Loader2 size={16} className="animate-spin" />{t('messages.sending')}</>) : (<><Send size={16} />{t('messages.sendAction')}</>)}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ padding: '24px 20px', borderRadius: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="var(--color-primary)" />
            {t('messages.history')} ({history.length})
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 200, maxWidth: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input className="input" style={{ paddingLeft: 30, paddingBlock: 6, fontSize: 'var(--text-xs)' }} placeholder={t('common.search')} value={searchHistory} onChange={(e) => setSearchHistory(e.target.value)} />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={refreshHistory} disabled={historyLoading} aria-label="Refresh history">
              <RefreshCw size={15} className={historyLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 16px' }}>
            <MessageSquare size={36} color="var(--color-text-muted)" />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{t('messages.emptyHistory')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  background: 'var(--color-surface-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 'var(--text-sm)' }}>{item.recipient_name}</strong>
                    <span className="badge badge-info">Ilova</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {new Date(item.created_at).toLocaleString(i18n.language)}
                  </span>
                </div>
                {item.title && <div style={{ fontWeight: 650, fontSize: 13 }}>{item.title}</div>}
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
