/** Velia tariflar — Start / Silver / Gold / Platinum */

export const TELEGRAM_PAYMENT_URL = 'https://t.me/velia_adminbot';
export const FREE_STUDENT_LIMIT = 20;

export type PlanId = 'start' | 'silver' | 'gold' | 'platinum' | 'free';

export interface PlanDefinition {
  id: PlanId;
  nameUz: string;
  priceMonthly: number;
  priceYearly: number;
  maxStudents: number;
  maxGroups: number;
  maxCourses: number;
  maxMockTestsMonth: number;
  maxMessagesDay: number;
  maxAiMessagesDay: number;
  featureAiChat: boolean;
  featureBusinessAnalytics: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'start',
    nameUz: 'Velia Start',
    priceMonthly: 0,
    priceYearly: 0,
    maxStudents: 20,
    maxGroups: 2,
    maxCourses: 1,
    maxMockTestsMonth: 1,
    maxMessagesDay: 1,
    maxAiMessagesDay: 0,
    featureAiChat: false,
    featureBusinessAnalytics: false,
  },
  {
    id: 'silver',
    nameUz: 'Velia Silver',
    priceMonthly: 59990,
    priceYearly: 599900,
    maxStudents: 100,
    maxGroups: 8,
    maxCourses: 4,
    maxMockTestsMonth: 5,
    maxMessagesDay: 5,
    maxAiMessagesDay: 0,
    featureAiChat: false,
    featureBusinessAnalytics: true,
  },
  {
    id: 'gold',
    nameUz: 'Velia Gold',
    priceMonthly: 159990,
    priceYearly: 1599900,
    maxStudents: 1000,
    maxGroups: 30,
    maxCourses: 15,
    maxMockTestsMonth: 20,
    maxMessagesDay: 20,
    maxAiMessagesDay: 10,
    featureAiChat: true,
    featureBusinessAnalytics: true,
  },
  {
    id: 'platinum',
    nameUz: 'Velia Platinum',
    priceMonthly: 399900,
    priceYearly: 3999000,
    maxStudents: 999999,
    maxGroups: 999999,
    maxCourses: 999999,
    maxMockTestsMonth: 50,
    maxMessagesDay: 999999,
    maxAiMessagesDay: 999999,
    featureAiChat: true,
    featureBusinessAnalytics: true,
  },
];

export function getPlan(id: string | null | undefined): PlanDefinition {
  const key = !id || id === 'free' ? 'start' : id;
  return PLANS.find((p) => p.id === key) ?? PLANS[0];
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";
}

export function formatStudentLimit(limit: number | null | undefined): string {
  if (limit == null || limit >= 999999) return 'cheksiz';
  return String(limit);
}

export const studentPriceTiers = [
  { maxStudents: 20, monthlyPrice: 0, sixMonthPrice: 0, yearlyPrice: 0, label: 'Start — 20 tagacha' },
] as const;

export function getStudentPriceTier(_n: number) {
  return studentPriceTiers[0];
}

export function getStudentPlanPrice(_n: number) {
  return 0;
}

export function getSubscriptionPrice(_n: number, _p: 'monthly' | 'sixMonth' | 'yearly') {
  return 0;
}
