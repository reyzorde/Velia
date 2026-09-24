import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Lock, Loader2, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useToast } from '../lib/toast-context';
import {
  bumpAiUsage,
  canUseAIChat,
  formatUsage,
  isUnlimited,
  loadUsage,
  TELEGRAM_PAYMENT_URL,
  type UsageSnapshot,
} from '../lib/subscription';
import {
  buildDirectorContext,
  chatWithCenterAI,
  type CenterChatContext,
  type ChatMessage,
} from '../services/gemini';

const AI_LOCALE = 'uz' as const;
const MAX_HISTORY_MESSAGES = 20;

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Salom! Men Velia AI Chatman. Markazingizdagi o‘quvchilar, davomat, to‘lovlar va guruhlar haqida savol bering.',
};

export default function AiChat() {
  const { center, subscription } = useAuth();
  const { toast } = useToast();

  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [context, setContext] = useState<CenterChatContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!center?.id) {
      setUsage(null);
      return () => {
        cancelled = true;
      };
    }

    void loadUsage(center.id, subscription)
      .then((nextUsage) => {
        if (!cancelled) setUsage(nextUsage);
      })
      .catch((error) => {
        console.error('Failed to load AI usage:', error);
        if (!cancelled) setUsage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [center?.id, subscription]);

  const loadCenterContext = useCallback(async () => {
    if (!center?.id) {
      setContext(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    setContextLoading(true);
    setContextError(null);

    try {
      const nextContext = await buildDirectorContext(
        center.id,
        center.name || 'Velia',
      );
      setContext(nextContext);
    } catch (error) {
      console.error('Failed to load center AI context:', error);
      setContext(null);
      setContextError(
        error instanceof Error && error.message
          ? error.message
          : 'Markaz ma’lumotlarini yuklab bo‘lmadi.',
      );
    } finally {
      setContextLoading(false);
    }
  }, [center?.id, center?.name]);

  useEffect(() => {
    void loadCenterContext();

    const intervalId = window.setInterval(() => {
      void loadCenterContext();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [loadCenterContext]);

  if (!usage) {
    return (
      <div className="students-page">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const access = canUseAIChat(usage);
  const limitHit = !access.ok;
  const featureLocked = !access.ok && !usage.plan.featureAiChat;

  if (featureLocked) {
    return (
      <div className="students-page">
        <div className="empty-state">
          <Lock size={40} color="var(--color-text-muted)" />
          <h3>AI Chat yopiq</h3>
          <p>{access.reason}</p>
          <a
            className="btn btn-primary"
            href={TELEGRAM_PAYMENT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Tarifni yangilash
          </a>
        </div>
      </div>
    );
  }

  const remaining = isUnlimited(usage.plan.maxAiMessagesDay)
    ? null
    : Math.max(0, usage.plan.maxAiMessagesDay - usage.aiUsedDay);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const userText = input.trim();

    if (!center?.id || !userText || busy) return;

    if (!access.ok) {
      toast(access.reason || 'AI limit', 'error');
      return;
    }

    if (!context) {
      toast(
        contextError || 'Markaz ma’lumotlari hali yuklanmagan.',
        'error',
      );
      return;
    }

    setInput('');
    setBusy(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: userText,
    };

    const requestMessages = [...messages, userMessage].slice(
      -MAX_HISTORY_MESSAGES,
    );

    setMessages(requestMessages);

    try {
      const reply = await chatWithCenterAI(
        requestMessages,
        context,
        AI_LOCALE,
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: reply,
      };

      setMessages((current) =>
        [...current, assistantMessage].slice(-MAX_HISTORY_MESSAGES),
      );

      const nextUsage = bumpAiUsage(center.id);
      setUsage((current) =>
        current
          ? {
              ...current,
              aiUsedDay: nextUsage,
            }
          : current,
      );
    }  catch (error: unknown) {
  console.error('Velia AI chat error:', error);

  const errorText =
    error instanceof Error && error.message.trim()
      ? `AI xatosi: ${error.message}`
      : 'Xatolik yuz berdi. Qayta urinib ko‘ring.';

  const errorMessage: ChatMessage = {
    role: 'assistant',
    content: errorText,
  };

  setMessages((current: ChatMessage[]) =>
    [...current, errorMessage].slice(-MAX_HISTORY_MESSAGES),
  );
} finally {
  setBusy(false);
}
  };

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
            {remaining != null
              ? ` · bugun ${formatUsage(
                  usage.aiUsedDay,
                  usage.plan.maxAiMessagesDay,
                )}`
              : ' · cheksiz'}
          </p>
        </div>

        <button
          className="btn"
          type="button"
          onClick={() => void loadCenterContext()}
          disabled={contextLoading || busy}
          title="Markaz ma’lumotlarini yangilash"
          aria-label="Markaz ma’lumotlarini yangilash"
        >
          <RefreshCw
            size={16}
            className={contextLoading ? 'animate-spin' : undefined}
          />
        </button>
      </div>

      {contextLoading ? (
        <div
          className="card"
          style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8 }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span>Markaz ma’lumotlari yuklanmoqda...</span>
        </div>
      ) : null}

      {!contextLoading && contextError ? (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            borderColor: 'var(--color-danger)',
          }}
        >
          {contextError}
        </div>
      ) : null}

      {limitHit ? (
        <div
          className="card"
          style={{
            padding: 12,
            marginBottom: 12,
            borderColor: 'var(--color-danger)',
          }}
        >
          {access.reason || 'AI limiti tugagan.'}
        </div>
      ) : null}

      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 360,
          padding: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
            maxHeight: 420,
          }}
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              style={{
                alignSelf:
                  message.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '10px 12px',
                borderRadius: 12,
                background:
                  message.role === 'user'
                    ? 'var(--color-primary)'
                    : 'var(--color-surface-2, var(--color-border))',
                color: message.role === 'user' ? '#fff' : 'inherit',
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {message.content}
            </div>
          ))}

          {busy ? (
            <div style={{ alignSelf: 'flex-start' }}>
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : null}
        </div>

        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Savolingizni yozing..."
            disabled={
              busy || limitHit || contextLoading || !context || !center?.id
            }
          />

          <button
            className="btn btn-primary"
            type="submit"
            disabled={
              busy ||
              limitHit ||
              contextLoading ||
              !context ||
              !center?.id ||
              !input.trim()
            }
            aria-label="Yuborish"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
