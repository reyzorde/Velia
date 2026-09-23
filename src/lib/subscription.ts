import { supabase } from './supabase';
import { getPlan, type PlanDefinition, TELEGRAM_PAYMENT_URL } from './pricing';
import type { CenterSubscription } from '../types/database';

export { TELEGRAM_PAYMENT_URL };

export type UsageSnapshot = {
  plan: PlanDefinition;
  studentsUsed: number;
  groupsUsed: number;
  coursesUsed: number;
  mockUsedMonth: number;
  messagesUsedDay: number;
  aiUsedDay: number;
};

function resolvePlanId(subscription: CenterSubscription | null | undefined): string {
  const raw = subscription?.plan;
  if (!raw || raw === 'free') return 'start';
  if (raw === 'monthly' || raw === 'yearly') return 'gold';
  return raw;
}

export function planFromSubscription(subscription: CenterSubscription | null | undefined): PlanDefinition {
  const plan = getPlan(resolvePlanId(subscription));
  if (typeof subscription?.student_limit === 'number' && subscription.student_limit > 0) {
    return { ...plan, maxStudents: subscription.student_limit };
  }
  return plan;
}

export function isUnlimited(n: number | null | undefined): boolean {
  return n == null || n >= 999999;
}

export function formatUsage(used: number, max: number | null | undefined): string {
  if (isUnlimited(max)) return `${used} / ∞`;
  return `${used} / ${max}`;
}

export async function loadUsage(centerId: string, subscription: CenterSubscription | null | undefined): Promise<UsageSnapshot> {
  const plan = planFromSubscription(subscription);
  const monthKey = new Date().toISOString().slice(0, 7);
  const dayKey = new Date().toISOString().slice(0, 10);

  const [students, groups, courses, mockCreated, messages, aiLocal] = await Promise.all([
    supabase.from('students').select('id').eq('center_id', centerId).eq('status', 'active'),
    supabase.from('groups').select('id').eq('center_id', centerId).eq('status', 'active'),
    supabase.from('courses').select('id').eq('center_id', centerId),
    supabase
      .from('mock_tests')
      .select('id')
      .eq('center_id', centerId)
      .gte('created_at', `${monthKey}-01T00:00:00.000Z`),
    supabase
      .from('student_messages')
      .select('id')
      .eq('center_id', centerId)
      .gte('created_at', `${dayKey}T00:00:00.000Z`),
    Promise.resolve(Number(localStorage.getItem(`velia_ai_${centerId}_${dayKey}`) || '0')),
  ]);

  try {
    const { data } = await supabase.rpc('get_center_limits', { p_center_id: centerId });
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      return {
        plan: getPlan(String(d.plan_id || resolvePlanId(subscription))),
        studentsUsed: Number(d.used_students ?? students.data?.length ?? 0),
        groupsUsed: Number(d.used_groups ?? groups.data?.length ?? 0),
        coursesUsed: Number(d.used_courses ?? courses.data?.length ?? 0),
        mockUsedMonth: Number(d.used_mock_tests_month ?? mockCreated.data?.length ?? 0),
        messagesUsedDay: Number(d.used_messages_day ?? messages.data?.length ?? 0),
        aiUsedDay: Number(d.used_ai_messages_day ?? aiLocal),
      };
    }
  } catch {
    // fallback below
  }

  return {
    plan,
    studentsUsed: students.data?.length ?? 0,
    groupsUsed: groups.data?.length ?? 0,
    coursesUsed: courses.data?.length ?? 0,
    mockUsedMonth: mockCreated.data?.length ?? 0,
    messagesUsedDay: messages.data?.length ?? 0,
    aiUsedDay: aiLocal,
  };
}

export function canCreateStudent(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (isUnlimited(u.plan.maxStudents)) return { ok: true };
  if (u.studentsUsed >= u.plan.maxStudents) {
    return {
      ok: false,
      reason: `O‘quvchilar limiti tugadi. ${u.plan.nameUz}: max ${u.plan.maxStudents} ta.`,
    };
  }
  return { ok: true };
}

export function canCreateGroup(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (isUnlimited(u.plan.maxGroups)) return { ok: true };
  if (u.groupsUsed >= u.plan.maxGroups) {
    return {
      ok: false,
      reason: `Guruh yaratish limiti tugadi. ${u.plan.nameUz}: max ${u.plan.maxGroups} ta.`,
    };
  }
  return { ok: true };
}

export function canCreateCourse(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (isUnlimited(u.plan.maxCourses)) return { ok: true };
  if (u.coursesUsed >= u.plan.maxCourses) {
    return {
      ok: false,
      reason: `Kurs yaratish limiti tugadi. ${u.plan.nameUz}: max ${u.plan.maxCourses} ta.`,
    };
  }
  return { ok: true };
}

export function canCreateMock(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (u.mockUsedMonth >= u.plan.maxMockTestsMonth) {
    return {
      ok: false,
      reason: `Mock test yaratish limiti tugadi. ${u.plan.nameUz}: oyiga max ${u.plan.maxMockTestsMonth} ta.`,
    };
  }
  return { ok: true };
}

export function canSendMessage(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (isUnlimited(u.plan.maxMessagesDay)) return { ok: true };
  if (u.messagesUsedDay >= u.plan.maxMessagesDay) {
    return {
      ok: false,
      reason: `Bugungi xabar limiti tugadi. ${u.plan.nameUz}: kuniga max ${u.plan.maxMessagesDay} ta.`,
    };
  }
  return { ok: true };
}

export function canUseAIChat(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (!u.plan.featureAiChat) {
    return { ok: false, reason: `AI Chat yopiq. ${u.plan.nameUz} tarifida mavjud emas. Gold yoki Platinum kerak.` };
  }
  if (isUnlimited(u.plan.maxAiMessagesDay)) return { ok: true };
  if (u.aiUsedDay >= u.plan.maxAiMessagesDay) {
    return {
      ok: false,
      reason: `Bugungi AI Chat limitingiz tugadi (${u.plan.maxAiMessagesDay}/kun). Ertaga qayta urinib ko‘ring.`,
    };
  }
  return { ok: true };
}

export function canUseBusinessAnalytics(u: UsageSnapshot): { ok: boolean; reason?: string } {
  if (!u.plan.featureBusinessAnalytics) {
    return { ok: false, reason: `Biznes tahlil yopiq. ${u.plan.nameUz} tarifida mavjud emas.` };
  }
  return { ok: true };
}

export function bumpAiUsage(centerId: string): number {
  const dayKey = new Date().toISOString().slice(0, 10);
  const key = `velia_ai_${centerId}_${dayKey}`;
  const next = Number(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(next));
  void supabase.rpc('increment_usage', { p_center_id: centerId, p_metric: 'ai_messages_day' }).then(() => undefined, () => undefined);
  return next;
}
