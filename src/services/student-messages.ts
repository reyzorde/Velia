import { supabase } from '../lib/supabase';
import type { StudentMessage, MessageChannel, MessageType, MessageStatus } from '../types/database';

export interface SendMessagePayload {
  center_id: string;
  student_id?: string | null;
  group_id?: string | null;
  recipient_name: string;
  recipient_phone?: string | null;
  recipient_email?: string | null;
  channel: MessageChannel;
  message_type: MessageType;
  title?: string | null;
  content: string;
  status?: MessageStatus;
  sent_by?: string | null;
}

// Local cache in case table is not yet migrated in Supabase
const localMessageHistoryKey = 'velia_local_messages';

function getLocalMessages(): StudentMessage[] {
  try {
    const raw = localStorage.getItem(localMessageHistoryKey);
    return raw ? (JSON.parse(raw) as StudentMessage[]) : [];
  } catch {
    return [];
  }
}

function saveLocalMessage(msg: StudentMessage) {
  try {
    const list = getLocalMessages();
    list.unshift(msg);
    localStorage.setItem(localMessageHistoryKey, JSON.stringify(list.slice(0, 100)));
  } catch {
    // ignore
  }
}

export async function saveMessageRecord(payload: SendMessagePayload): Promise<StudentMessage> {
  const fallbackMessage: StudentMessage = {
    id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    center_id: payload.center_id,
    student_id: payload.student_id ?? null,
    group_id: payload.group_id ?? null,
    recipient_name: payload.recipient_name,
    recipient_phone: payload.recipient_phone ?? null,
    recipient_email: payload.recipient_email ?? null,
    channel: payload.channel,
    message_type: payload.message_type,
    title: payload.title ?? null,
    content: payload.content,
    status: payload.status ?? 'sent',
    sent_by: payload.sent_by ?? null,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('student_messages')
      .insert({
        center_id: payload.center_id,
        student_id: payload.student_id || null,
        group_id: payload.group_id || null,
        recipient_name: payload.recipient_name,
        recipient_phone: payload.recipient_phone || null,
        recipient_email: payload.recipient_email || null,
        channel: payload.channel,
        message_type: payload.message_type,
        title: payload.title || null,
        content: payload.content,
        status: payload.status || 'sent',
        sent_by: payload.sent_by || null,
      })
      .select()
      .single();

    if (!error && data) {
      return data as StudentMessage;
    }
  } catch (err) {
    console.warn('Supabase student_messages unavailable, using local store:', err);
  }

  saveLocalMessage(fallbackMessage);
  return fallbackMessage;
}

export async function fetchMessageHistory(
  centerId: string,
  limit = 50,
  studentId?: string
): Promise<StudentMessage[]> {
  try {
    let query = supabase
      .from('student_messages')
      .select('*')
      .eq('center_id', centerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data as StudentMessage[];
    }
  } catch {
    // fallback to local storage
  }

  const local = getLocalMessages().filter(
    (m) => m.center_id === centerId && (!studentId || m.student_id === studentId)
  );
  return local.slice(0, limit);
}

export function cleanPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Dispatches the message to external channel application (SMS, Telegram, WhatsApp, Email).
 */
export function dispatchToChannel(
  _channel: MessageChannel,
  _contact: { phone?: string | null; email?: string | null },
  _content: string,
  _title?: string
) {
  // Faqat ilova ichida saqlanadi — tashqi dastur ochilmaydi
}

/**
 * Standard quick message templates in Uzbek, Russian, English
 */
export function getMessageTemplates(locale: string = 'uz') {
  if (locale.startsWith('ru')) {
    return [
      {
        id: 'debt',
        type: 'debt_reminder' as MessageType,
        label: 'Напоминание об оплате',
        template: (name: string, center: string, amount: string) =>
          `Здравствуйте, ${name}! Напоминаем о задолженности за обучение в размере ${amount} сум в учебном центре ${center}. Просим произвести оплату. Спасибо!`,
      },
      {
        id: 'attendance',
        type: 'attendance_alert' as MessageType,
        label: 'Предупреждение о пропусках',
        template: (name: string, center: string) =>
          `Здравствуйте, ${name}! Сегодня вы пропустили занятие в центре ${center}. Если возникли трудности, пожалуйста, свяжитесь с нами.`,
      },
      {
        id: 'praise',
        type: 'praise' as MessageType,
        label: 'Похвала за успехи',
        template: (name: string, center: string) =>
          `Уважаемый(ая) ${name}! Отличные результаты и безупречная посещаемость в центре ${center}. Продолжайте в том же духе!`,
      },
      {
        id: 'announcement',
        type: 'announcement' as MessageType,
        label: 'Объявление',
        template: (_name: string, center: string) =>
          `Уважаемые ученики! Важное объявление от учебного центра ${center}: просим ознакомиться с обновленным расписанием.`,
      },
    ];
  }

  if (locale.startsWith('en')) {
    return [
      {
        id: 'debt',
        type: 'debt_reminder' as MessageType,
        label: 'Payment Reminder',
        template: (name: string, center: string, amount: string) =>
          `Hello ${name}! This is a reminder of your outstanding tuition balance of ${amount} so'm at ${center}. Please settle it at your earliest convenience. Thank you!`,
      },
      {
        id: 'attendance',
        type: 'attendance_alert' as MessageType,
        label: 'Attendance Notice',
        template: (name: string, center: string) =>
          `Hello ${name}! You missed today's lesson at ${center}. Please contact us if you need assistance catching up.`,
      },
      {
        id: 'praise',
        type: 'praise' as MessageType,
        label: 'Encouragement & Praise',
        template: (name: string, center: string) =>
          `Dear ${name}! Congratulations on your consistent attendance and active progress at ${center}. Keep up the great work!`,
      },
      {
        id: 'announcement',
        type: 'announcement' as MessageType,
        label: 'Announcement',
        template: (_name: string, center: string) =>
          `Dear students! An important update from ${center}: please review the latest updates for your class schedule.`,
      },
    ];
  }

  // Default Uzbek
  return [
    {
      id: 'debt',
      type: 'debt_reminder' as MessageType,
      label: "To'lov eslatmasi",
      template: (name: string, center: string, amount: string) =>
        `Assalomu alaykum, ${name}! Sizning ${center} o'quv markazida ${amount} so'm miqdorida to'lov muddati kelganligini eslatib o'tamiz. Iltimos, o'z vaqtida to'lovni amalga oshirishingizni so'raymiz. Rahmat!`,
    },
    {
      id: 'attendance',
      type: 'attendance_alert' as MessageType,
      label: 'Davomat ogohlantirishi',
      template: (name: string, center: string) =>
        `Assalomu alaykum, ${name}! Siz ${center} o'quv markazidagi bugungi darsda qatnashmadingiz. Sababini bildirish va darsdan qolib ketmaslik uchun markaz ma'muriyati bilan bog'laning.`,
    },
    {
      id: 'praise',
      type: 'praise' as MessageType,
      label: "Rag'batlantirish va tabrik",
      template: (name: string, center: string) =>
        `Hurmatli ${name}! ${center} markazidagi darslarda a'lo davomatingiz va tirishqoqligingiz uchun minnatdorchilik bildiramiz. Muvaffaqiyatlar bardavom bo'lsin!`,
    },
    {
      id: 'announcement',
      type: 'announcement' as MessageType,
      label: "Guruhga e'lon",
      template: (_name: string, center: string) =>
        `Hurmatli o'quvchilar! ${center} o'quv markazidan muhim e'lon: kelgusi darslar jadvali va rejadagi o'zgarishlar bilan tanishib chiqishingizni so'raymiz.`,
    },
  ];
}
