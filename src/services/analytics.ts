export interface DashboardSignal {
  label: string;
  value: string;
  level: 'critical' | 'warning' | 'good' | 'neutral';
}

export function buildDashboardSignals(context: Record<string, unknown>, locale?: string): DashboardSignal[] {
  const language = locale?.startsWith('ru') ? 'ru' : locale?.startsWith('en') ? 'en' : 'uz';
  const totalStudents = Number(context.totalStudents || 0);
  const activeStudents = Number(context.activeStudents || 0);
  const overdue = Number(context.overdue || 0);
  const attendance = Number(context.attendance || 0);
  const revenueChange = Number(context.revenueChange || 0);
  const lowCapacityGroups = Number(context.lowCapacityGroups || 0);

  const signals: DashboardSignal[] = [
    {
      label: language === 'ru' ? 'Ученики в зоне риска' : language === 'en' ? 'Students at risk' : 'Xavfdagi oʻquvchilar',
      value: `${Math.max(0, totalStudents - activeStudents)} ${language === 'ru' ? 'учеников' : language === 'en' ? 'students' : 'oʻquvchi'}`,
      level: totalStudents - activeStudents > 0 ? 'warning' : 'good',
    },
    {
      label: language === 'ru' ? 'Скоро к оплате' : language === 'en' ? 'Due soon' : 'Tez orada toʻlanadi',
      value: `${overdue} ${language === 'ru' ? 'позиций' : language === 'en' ? 'items' : 'ta'}`,
      level: overdue > 0 ? 'critical' : 'good',
    },
    {
      label: language === 'ru' ? 'Посещаемость' : language === 'en' ? 'Attendance' : 'Davomat',
      value: `${attendance}%`,
      level: attendance < 85 ? 'warning' : 'good',
    },
    {
      label: language === 'ru' ? 'Тренд дохода' : language === 'en' ? 'Revenue trend' : 'Daromad trendi',
      value: revenueChange >= 0 ? `+${revenueChange}%` : `${revenueChange}%`,
      level: revenueChange < 0 ? 'warning' : 'good',
    },
    {
      label: language === 'ru' ? 'Группы с низкой заполненностью' : language === 'en' ? 'Low capacity groups' : 'Kam band guruhlar',
      value: `${lowCapacityGroups} ${language === 'ru' ? 'групп' : language === 'en' ? 'groups' : 'guruh'}`,
      level: lowCapacityGroups > 0 ? 'neutral' : 'good',
    },
  ];

  return signals;
}
