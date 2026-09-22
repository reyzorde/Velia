import { supabase } from '../lib/supabase';

export type GeminiHealthLevel = 'good' | 'warning' | 'critical' | 'unknown';

export interface GeminiInsightAction {
  priority: number;
  title: string;
  description: string;
  actionType: string;
}

export interface GeminiInsightItem {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  action: string;
  relatedIds: string[];
}

export interface GeminiStructuredResponse {
  summary: string;
  health: GeminiHealthLevel;
  insights: GeminiInsightItem[];
  recommendedActions: GeminiInsightAction[];
}

export type GeminiLocale = 'uz' | 'ru' | 'en';

function normalizeLocale(locale?: string): GeminiLocale {
  if (locale?.startsWith('ru')) return 'ru';
  if (locale?.startsWith('en')) return 'en';
  return 'uz';
}

export function buildLocalFallbackInsight(context: Record<string, unknown>, locale?: string): GeminiStructuredResponse {
  const language = normalizeLocale(locale);
  const totalStudents = Number(context.totalStudents || 0);
  const activeStudents = Number(context.activeStudents || 0);
  const overdue = Number(context.overdue || 0);
  const revenue = Number(context.revenue || 0);
  const attendance = Number(context.attendance || 0);

  const insights: GeminiInsightItem[] = [];

  if (overdue > 0) {
    const copy = {
      uz: {
        title: 'Muddati o‘tgan to‘lovlar e’tibor talab qiladi',
        description: `${overdue} ta muddati o‘tgan to‘lov pul oqimiga ta’sir qilmoqda.`,
        action: 'Bugun eslatmalar va to‘lovlarni undirishni ustuvor qiling.',
      },
      ru: {
        title: 'Просроченные платежи требуют внимания',
        description: `${overdue} просроченных платежей влияют на денежный поток.`,
        action: 'В первую очередь отправьте напоминания и свяжитесь с должниками.',
      },
      en: {
        title: 'Overdue payments need attention',
        description: `${overdue} overdue item(s) are currently affecting cash flow.`,
        action: 'Prioritize reminders and payment follow-up today.',
      },
    }[language];
    insights.push({
      type: 'payment',
      severity: 'high',
      ...copy,
      relatedIds: [],
    });
  }

  if (attendance < 85) {
    const copy = {
      uz: {
        title: 'Davomat belgilangan darajadan past',
        description: `Joriy davomat ${attendance}%. Bu sog‘lom ish mezonidan past.`,
        action: 'Guruhlar faolligini ko‘rib chiqing va faol bo‘lmagan o‘quvchilar bilan bog‘laning.',
      },
      ru: {
        title: 'Посещаемость ниже целевого уровня',
        description: `Текущая посещаемость составляет ${attendance}%, что ниже рабочего ориентира.`,
        action: 'Проверьте активность групп и свяжитесь с неактивными учениками.',
      },
      en: {
        title: 'Attendance is below target',
        description: `Current attendance is ${attendance}%, below the healthy working benchmark.`,
        action: 'Review group activity and contact inactive students.',
      },
    }[language];
    insights.push({
      type: 'attendance',
      severity: 'medium',
      ...copy,
      relatedIds: [],
    });
  }

  if (activeStudents < totalStudents) {
    const copy = {
      uz: {
        title: 'O‘quvchilarni saqlab qolish tahlili kerak',
        description: `${totalStudents - activeStudents} nafar o‘quvchi hozir nofaol yoki xavf ostida.`,
        action: 'Qayta faollashtirish kampaniyalari va to‘lov eslatmalarini ko‘rib chiqing.',
      },
      ru: {
        title: 'Нужен анализ удержания учеников',
        description: `${totalStudents - activeStudents} учеников сейчас неактивны или находятся в зоне риска.`,
        action: 'Проверьте кампании возврата и напоминания об оплате.',
      },
      en: {
        title: 'Retention review is needed',
        description: `${totalStudents - activeStudents} students are currently inactive or at risk.`,
        action: 'Review reactivation campaigns and payment reminders.',
      },
    }[language];
    insights.push({
      type: 'retention',
      severity: 'medium',
      ...copy,
      relatedIds: [],
    });
  }

  if (revenue <= 0) {
    const copy = {
      uz: {
        title: 'Daromad o‘sishi to‘xtagan',
        description: 'Mavjud ma’lumotlarda yaqinda tushum qayd etilmagan.',
        action: 'Yangilash va to‘lovlarni undirish ustuvorliklarini tasdiqlang.',
      },
      ru: {
        title: 'Доход не растёт',
        description: 'В доступных данных нет недавних поступлений.',
        action: 'Проверьте приоритеты продления и сбора платежей.',
      },
      en: {
        title: 'Revenue is flat',
        description: 'There is no recent collection in the available data.',
        action: 'Confirm renewal and payment collection priorities.',
      },
    }[language];
    insights.push({
      type: 'revenue',
      severity: 'low',
      ...copy,
      relatedIds: [],
    });
  }

  const copy = {
    uz: {
      summary: 'AI tahlili vaqtincha mavjud emas. Markaz paneldagi so‘nggi real ko‘rsatkichlar asosida ko‘rib chiqilmoqda.',
      stableTitle: 'Jiddiy signal aniqlanmadi',
      stableDescription: 'Mavjud ma’lumotlarga ko‘ra markaz ko‘rsatkichlari barqaror ko‘rinmoqda.',
      stableAction: 'Davomat va to‘lovlar barqarorligini kuzatishda davom eting.',
      paymentsTitle: 'Muddati o‘tgan to‘lovlarni ko‘rib chiqing',
      paymentsDescription: 'Eng katta summali muddati o‘tgan to‘lovlarni birinchi ko‘rib chiqing.',
      studentsTitle: 'Nofaol o‘quvchilar bilan bog‘laning',
      studentsDescription: 'Yaqinda dars qoldirgan o‘quvchilar bilan bog‘laning.',
      groupsTitle: 'Guruhlar bandligini tekshiring',
      groupsDescription: 'Kam band guruhlarni ko‘rib chiqing va o‘quvchilarni guruhlar bo‘yicha qayta taqsimlang.',
    },
    ru: {
      summary: 'AI-анализ временно недоступен. Центр оценивается по последним реальным показателям на панели.',
      stableTitle: 'Критических сигналов не обнаружено',
      stableDescription: 'По доступным данным показатели центра выглядят стабильными.',
      stableAction: 'Продолжайте контролировать посещаемость и регулярность оплат.',
      paymentsTitle: 'Проверьте просроченные платежи',
      paymentsDescription: 'Сначала обработайте просроченные платежи с наибольшей суммой.',
      studentsTitle: 'Свяжитесь с неактивными учениками',
      studentsDescription: 'Свяжитесь с учениками, которые недавно пропускали занятия.',
      groupsTitle: 'Проверьте заполненность групп',
      groupsDescription: 'Проверьте группы с низкой заполненностью и перераспределите лидов.',
    },
    en: {
      summary: 'AI analysis is temporarily unavailable. The center is being reviewed with the latest real metrics available in the dashboard.',
      stableTitle: 'No critical signals detected',
      stableDescription: 'The current center metrics look stable based on the available data.',
      stableAction: 'Keep monitoring attendance and billing consistency.',
      paymentsTitle: 'Review overdue payments',
      paymentsDescription: 'Sort the highest-value overdue payments first.',
      studentsTitle: 'Contact inactive students',
      studentsDescription: 'Reach out to students with recent absenteeism.',
      groupsTitle: 'Check group occupancy',
      groupsDescription: 'Review low-capacity groups and rebalance student assignments.',
    },
  }[language];

  const fallback: GeminiStructuredResponse = {
    summary: copy.summary,
    health: insights.some((item) => item.severity === 'high') ? 'warning' : 'good',
    insights: insights.length ? insights : [
      {
        type: 'ops',
        severity: 'low',
        title: copy.stableTitle,
        description: copy.stableDescription,
        action: copy.stableAction,
        relatedIds: [],
      },
    ],
    recommendedActions: [
      { priority: 1, title: copy.paymentsTitle, description: copy.paymentsDescription, actionType: 'payment' },
      { priority: 2, title: copy.studentsTitle, description: copy.studentsDescription, actionType: 'retention' },
      { priority: 3, title: copy.groupsTitle, description: copy.groupsDescription, actionType: 'operations' },
    ],
  };

  return fallback;
}

export function validateGeminiResponse(payload: unknown): payload is GeminiStructuredResponse {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.summary !== 'string') return false;
  if (typeof candidate.health !== 'string') return false;
  if (!Array.isArray(candidate.insights)) return false;
  if (!Array.isArray(candidate.recommendedActions)) return false;
  return true;
}

export async function generateDirectorSummary(context: Record<string, unknown>, locale?: string): Promise<GeminiStructuredResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<GeminiStructuredResponse>('gemini-director', {
      body: {
        context,
        locale,
      },
    });

    if (!error && data && validateGeminiResponse(data)) {
      return data;
    }

    if (error) {
      const errorContext = (error as { context?: Response }).context;
      let details = '';

      if (errorContext) {
        try {
          const payload = await errorContext.clone().json() as { details?: string; error?: string };
          details = payload.details || payload.error || '';
        } catch {
          // The function may return a non-JSON gateway error.
        }
      }

      console.error('Gemini Director request failed', error.message, details);
    }
  } catch {
    // Keep the dashboard usable while the Edge Function is unavailable.
  }

  return buildLocalFallbackInsight(context, locale);
}

export async function generateCenterHealthExplanation(context: Record<string, unknown>, locale?: string): Promise<string> {
  const result = await generateDirectorSummary(context, locale);
  return result.summary || buildLocalFallbackInsight(context, locale).summary;
}

export type StudentMessageKind =
  | 'debt_reminder'
  | 'attendance_alert'
  | 'praise'
  | 'announcement'
  | 'general';

export async function generateStudentMessage(params: {
  studentName: string;
  centerName: string;
  type: StudentMessageKind | string;
  debt?: number;
  locale?: string;
}): Promise<string> {
  const language = normalizeLocale(params.locale);
  const name = params.studentName || (language === 'ru' ? 'Ученик' : language === 'en' ? 'Student' : "O'quvchi");
  const center = params.centerName || 'Velia';
  const debt =
    typeof params.debt === 'number' && params.debt > 0
      ? new Intl.NumberFormat('uz-UZ').format(params.debt)
      : null;

  try {
    const { data, error } = await supabase.functions.invoke<{ text?: string }>('gemini-director', {
      body: {
        mode: 'student_message',
        studentName: name,
        centerName: center,
        type: params.type,
        debt: params.debt,
        locale: language,
      },
    });
    if (!error && data?.text && typeof data.text === 'string') {
      return data.text.trim();
    }
  } catch {
    // local fallback
  }

  if (language === 'ru') {
    if (params.type === 'debt_reminder') {
      return `Здравствуйте, ${name}! В центре «${center}»${debt ? ` у вас задолженность ${debt} сум` : ' есть задолженность'}. Пожалуйста, оплатите в ближайшее время.`;
    }
    if (params.type === 'attendance_alert') {
      return `Здравствуйте, ${name}! Обратите внимание на посещаемость в центре «${center}».`;
    }
    if (params.type === 'praise') {
      return `Поздравляем, ${name}! Отличные результаты в центре «${center}». Так держать!`;
    }
    return `Уважаемый(ая) ${name}, сообщение от центра «${center}».`;
  }

  if (language === 'en') {
    if (params.type === 'debt_reminder') {
      return `Hello ${name}! At ${center}${debt ? ` your outstanding balance is ${debt} UZS` : ' you have an outstanding balance'}. Please pay soon.`;
    }
    if (params.type === 'attendance_alert') {
      return `Hello ${name}! Please check your attendance at ${center}.`;
    }
    if (params.type === 'praise') {
      return `Great job, ${name}! Excellent progress at ${center}.`;
    }
    return `Dear ${name}, a message from ${center}.`;
  }

  if (params.type === 'debt_reminder') {
    return `Assalomu alaykum, ${name}! «${center}» markazida${debt ? ` qarzdorligingiz ${debt} so‘m` : ' qarzdorligingiz bor'}. Iltimos, tez orada to‘lovni amalga oshiring.`;
  }
  if (params.type === 'attendance_alert') {
    return `Assalomu alaykum, ${name}! «${center}» markazidagi davomatingizga e’tibor bering.`;
  }
  if (params.type === 'praise') {
    return `Tabriklaymiz, ${name}! «${center}» markazida a’lo natija. Davom eting!`;
  }
  if (params.type === 'announcement') {
    return `Hurmatli ${name}, «${center}» markazidan muhim e’lon.`;
  }
  return `Hurmatli ${name}, «${center}» markazidan xabar.`;
}
