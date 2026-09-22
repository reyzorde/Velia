import { FormEvent, useEffect, useState } from 'react';
import { MessageSquare, Lock, Loader2, Send } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import {
  loadUsage,
  canUseAIChat,
  bumpAiUsage,
  formatUsage,
  isUnlimited,
  TELEGRAM_PAYMENT_URL,
  type UsageSnapshot,
} from '../lib/subscription';
import { supabase } from '../lib/supabase';

type ChatMsg = { role: 'user' | 'assistant'; text: string };

export default function AiChat() {
  const { center, subscription } = useAuth();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      text: 'Salom! Men Velia AI Chatman. Markazingizdagi o‘quvchilar, davomat, to‘lovlar va guruhlar haqida savol bering.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!center?.id) return;
    void loadUsage(center.id, subscription).then(setUsage);
  }, [center?.id, subscription]);

  if (!usage) {
    return (
      <div className="students-page">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const access = canUseAIChat(usage);
  if (!access.ok && !usage.plan.featureAiChat) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <Lock size={40} color="var(--color-text-muted)" />
          <h3>AI Chat yopiq</h3>
          <p>{access.reason}</p>
          <a className="btn btn-primary" href={TELEGRAM_PAYMENT_URL} target="_blank" rel="noreferrer">
            Tarifni yangilash
          </a>
        </div>
      </div>
    );
  }

  const remaining = isUnlimited(usage.plan.maxAiMessagesDay)
    ? null
    : Math.max(0, usage.plan.maxAiMessagesDay - usage.aiUsedDay);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!center?.id || !input.trim()) return;
    const check = canUseAIChat(usage);
    if (!check.ok) {
      toast(check.reason || 'Limit', 'error');
      return;
    }
    const userText = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: userText }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ text?: string; summary?: string }>('gemini-director', {
        body: {
          mode: 'chat',
          message: userText,
          centerId: center.id,
          locale: 'uz',
        },
      });
      let reply =
        (data && (data.text || data.summary)) ||
        'Hozir javob olinmadi. Keyinroq urinib ko‘ring yoki markaz ma’lumotlarini qisqa so‘rang.';
      if (error) {
        reply =
          'AI vaqtincha ishlamayapti. Savolingiz qabul qilindi, lekin server javob bermadi. Keyinroq qayta urinib ko‘ring.';
      }
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      const next = bumpAiUsage(center.id);
      setUsage((u) => (u ? { ...u, aiUsedDay: next } : u));
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Xatolik yuz berdi. Qayta urinib ko‘ring.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const limitHit = !canUseAIChat(usage).ok;

  return (
    <div className="students-page">
      <div className="students-page__header">
        <div>
          <div className="students-page__eyebrow">
            <MessageSquare size={14} /> AI Chat
          </div>
          <h1>Velia AI Chat</h1>
          <p className="students-page__count">
            {usage.plan.nameUz}
            {remaining != null ? ` · bugun ${formatUsage(usage.aiUsedDay, usage.plan.maxAiMessagesDay)}` : ' · cheksiz'}
          </p>
        </div>
      </div>

      {limitHit && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--color-danger)' }}>
          {canUseAIChat(usage).reason}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 360, padding: 16 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 420 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 12px',
                borderRadius: 12,
                background: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-surface-2, var(--color-border))',
                color: m.role === 'user' ? '#fff' : 'inherit',
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {m.text}
            </div>
          ))}
        </div>
        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Savolingizni yozing..."
            disabled={busy || limitHit}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || limitHit || !input.trim()}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
