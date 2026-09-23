import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  MessageSquare,
  Sparkles,
  Phone,
  Mail,
  Users,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { loadUsage, canSendMessage, TELEGRAM_PAYMENT_URL, type UsageSnapshot } from '../lib/subscription';
import { useToast } from '../lib/toast-context';
import { getCenterDebtors } from '../lib/debt';
import type { Student, Group, StudentMessage, MessageChannel, MessageType } from '../types/database';
import {
  saveMessageRecord,
  fetchMessageHistory,
  dispatchToChannel,
  getMessageTemplates,
  cleanPhoneNumber,
} from '../services/student-messages';
import { generateStudentMessage } from '../services/gemini';

export default function Messages() {
  const { t, i18n } = useTranslation();
  const { center, subscription } = useAuth();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [debtors, setDebtors] = useState<any[]>([]);
  const [history, setHistory] = useState<StudentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form State
  const [targetType, setTargetType] = useState<'single' | 'group' | 'debtors' | 'all'>('single');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [channel] = useState<MessageChannel>('in_app');
  const [messageType, setMessageType] = useState<MessageType>('debt_reminder');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchHistory, setSearchHistory] = useState('');

  // Initial load
  useEffect(() => {
    if (!center?.id) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [{ data: sData }, { data: gData }, debtList, hist, usageSnap] = await Promise.all([
          supabase.from('students').select('*').eq('center_id', center!.id).order('full_name'),
          supabase.from('groups').select('*').eq('center_id', center!.id).eq('status', 'active'),
          getCenterDebtors(center!.id),
          fetchMessageHistory(center!.id),
          loadUsage(center!.id, subscription),
        ]);

        if (cancelled) return;
        setStudents((sData as Student[]) || []);
        setGroups((gData as Group[]) || []);
        setDebtors(debtList || []);
        setHistory(hist);
        setUsage(usageSnap);
      } catch (err) {
        console.error('Failed to load message data', err);
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
    } finally {
      setHistoryLoading(false);
    }
  };

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  const selectedDebtor = useMemo(() => {
    return debtors.find(
      (d) =>
        d?.student_id === selectedStudentId ||
        d?.student?.id === selectedStudentId
    );
  }, [debtors, selectedStudentId]);

  const templates = useMemo(() => {
    return getMessageTemplates(i18n.language);
  }, [i18n.language]);

  const applyTemplate = (templateId: string) => {
    const item = templates.find((tmp) => tmp.id === templateId);
    if (!item) return;

    setMessageType(item.type);
    const studentName = selectedStudent?.full_name || 'O‘quvchi';
    const centerName = center?.name || 'Velia';
    const amount = selectedDebtor ? selectedDebtor.debt.toLocaleString() : '100,000';

    setContent(item.template(studentName, centerName, amount));
  };

  const handleAiGenerate = async () => {
    if (!center?.name) return;
    setGeneratingAi(true);

    try {
      const studentName = selectedStudent?.full_name || (targetType === 'group' ? 'O‘quvchilar' : 'O‘quvchi');
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

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !center?.id) return;

    setSending(true);
    try {
      const snap = usage || (await loadUsage(center.id, subscription));
      setUsage(snap);
      const limit = canSendMessage(snap);
      if (!limit.ok) {
        toast(limit.reason || 'Xabar limiti tugadi', 'error');
        setSending(false);
        return;
      }

      if (targetType === 'single') {
        if (!selectedStudent) {
          toast(t('messages.selectStudent'), 'error');
          setSending(false);
          return;
        }

        const saved = await saveMessageRecord({
          center_id: center.id,
          student_id: selectedStudent.id,
          recipient_name: selectedStudent.full_name,
          recipient_phone: selectedStudent.phone,
          recipient_email: selectedStudent.email,
          channel,
          message_type: messageType,
          title: title.trim() || null,
          content: content.trim(),
        });

        dispatchToChannel(
          channel,
          { phone: selectedStudent.phone, email: selectedStudent.email },
          content.trim(),
          title.trim()
        );

        setHistory((prev) => [saved, ...prev]);
        toast(t('common.success'));
      } else if (targetType === 'debtors') {
        if (debtors.length === 0) {
          toast('Qarzdorlar mavjud emas', 'info');
          setSending(false);
          return;
        }

        for (const item of debtors) {
          const personalizedContent = content.replace(
            /\[O'quvchi\]|\{name\}/gi,
            item.student.full_name
          );

          const saved = await saveMessageRecord({
            center_id: center.id,
            student_id: item.student.id,
            recipient_name: item.student.full_name,
            recipient_phone: item.student.phone,
            recipient_email: item.student.email,
            channel,
            message_type: 'debt_reminder',
            title: title.trim() || null,
            content: personalizedContent,
          });

          setHistory((prev) => [saved, ...prev]);
        }

        // Open channel for first debtor as immediate action
        if (debtors[0]) {
          dispatchToChannel(
            channel,
            { phone: debtors[0].student.phone, email: debtors[0].student.email },
            content.trim(),
            title.trim()
          );
        }

        toast(`${debtors.length} ta qarzdorga xabarlar saqlandi va jo'natildi!`);
      } else if (targetType === 'group') {
        const grp = groups.find((g) => g.id === selectedGroupId);
        const groupTitle = grp ? grp.name : 'Guruh';

        const saved = await saveMessageRecord({
          center_id: center.id,
          group_id: selectedGroupId || null,
          recipient_name: `Guruh: ${groupTitle}`,
          channel,
          message_type: 'announcement',
          title: title.trim() || null,
          content: content.trim(),
        });

        setHistory((prev) => [saved, ...prev]);
        dispatchToChannel(channel, {}, content.trim(), title.trim());
        toast(t('common.success'));
      } else {
        // all active
        const saved = await saveMessageRecord({
          center_id: center.id,
          recipient_name: `Barcha o'quvchilar (${students.length})`,
          channel,
          message_type: 'announcement',
          title: title.trim() || null,
          content: content.trim(),
        });

        setHistory((prev) => [saved, ...prev]);
        dispatchToChannel(channel, {}, content.trim(), title.trim());
        toast(t('common.success'));
      }

      setContent('');
      setTitle('');
    } catch (err) {
      console.error(err);
      toast(t('common.error'), 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return history;
    const q = searchHistory.toLowerCase();
    return history.filter(
      (h) =>
        h.recipient_name.toLowerCase().includes(q) ||
        h.content.toLowerCase().includes(q) ||
        h.channel.toLowerCase().includes(q)
    );
  }, [history, searchHistory]);

  const channelBadge = (_ch: MessageChannel) => <span className="badge badge-info">Ilova</span>;

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
      {/* Top Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-primary)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <MessageSquare size={14} /> Velia Messenger
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 700, letterSpacing: '-0.03em' }}>
            {t('messages.title')}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {t('messages.subtitle')}
          </p>
        </div>
      </div>

      {/* Main Composer Card */}
      <div className="card" style={{ padding: '24px 20px', borderRadius: 20, boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Send size={18} color="var(--color-primary)" />
          {t('messages.sendNew')}
        </h2>

        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Target audience selection */}
          <div>
            <label className="input-label" style={{ marginBottom: 8 }}>{t('messages.recipientType')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${targetType === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetType('single')}
              >
                {t('messages.singleStudent')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetType === 'group' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetType('group')}
              >
                {t('messages.groupStudents')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetType === 'debtors' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTargetType('debtors');
                  setMessageType('debt_reminder');
                }}
              >
                {t('messages.debtorsOnly')} ({debtors.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${targetType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTargetType('all')}
              >
                {t('messages.allActive')} ({students.filter((s) => s.status === 'active').length})
              </button>
            </div>
          </div>

          {/* Conditional Dropdown for single / group */}
          {targetType === 'single' && (
            <div className="input-group">
              <label className="input-label">{t('messages.selectStudent')} *</label>
              <select
                className="input"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
              >
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
              <select
                className="input"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                required
              >
                <option value="">— {t('messages.selectGroup')} —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Channel Selector */}
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
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title (for Email/announcement) */}
          {false && channel === 'email' && (
            <div className="input-group">
              <label className="input-label">{t('messages.messageTitle')}</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mavzu..."
              />
            </div>
          )}

          {/* Message Content & AI Generator */}
          <div className="input-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="input-label" style={{ marginBottom: 0 }}>{t('messages.messageContent')} *</label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleAiGenerate}
                disabled={generatingAi}
                style={{ color: 'var(--color-primary)', fontWeight: 600, gap: 6 }}
              >
                {generatingAi ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('messages.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {t('messages.generateWithAi')}
                  </>
                )}
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

          {/* Send Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={sending || !content.trim()}>
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('messages.sending')}
                </>
              ) : (
                <>
                  <Send size={16} />
                  {t('messages.sendAction')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Sent Message History */}
      <div className="card" style={{ padding: '24px 20px', borderRadius: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="var(--color-primary)" />
            {t('messages.history')} ({history.length})
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 200, maxWidth: '100%' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                className="input"
                style={{ paddingLeft: 30, paddingBlock: 6, fontSize: 'var(--text-xs)' }}
                placeholder={t('common.search')}
                value={searchHistory}
                onChange={(e) => setSearchHistory(e.target.value)}
              />
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={refreshHistory}
              disabled={historyLoading}
              aria-label="Refresh history"
            >
              <RefreshCw size={15} className={historyLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 16px' }}>
            <MessageSquare size={36} color="var(--color-text-muted)" />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              {t('messages.emptyHistory')}
            </p>
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
                    <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                      {item.recipient_name}
                    </strong>
                    {channelBadge(item.channel)}
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {new Date(item.created_at).toLocaleString(i18n.language)}
                  </span>
                </div>

                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </p>

                {item.recipient_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {item.recipient_phone}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => dispatchToChannel(item.channel, { phone: item.recipient_phone, email: item.recipient_email }, item.content)}
                      style={{ fontSize: 'var(--text-xs)', gap: 4 }}
                    >
                      <ExternalLink size={12} />
                      {t('messages.openApp')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
