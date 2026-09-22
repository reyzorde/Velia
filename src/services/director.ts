import { supabase } from '../lib/supabase';
import { calculateStudentRisk, type RiskLevel } from './risk';

export interface DirectorContext {
  revenue: number; revenueChange: number; attendanceRate: number; totalGroups: number; lowCapacityGroups: number;
  riskSummary: { low: number; medium: number; high: number };
  students: Array<{ id: string; full_name: string; score: number; level: RiskLevel; reasons: string[] }>;
}

/** Uses live center records only; empty data produces no invented signals. */
export async function buildDirectorContext(centerId: string): Promise<DirectorContext> {
  const [{ data: students = [] }, { data: groups = [] }, { data: payments = [] }] = await Promise.all([
    supabase.from('students').select('id, full_name, status').eq('center_id', centerId),
    supabase.from('groups').select('id, price').eq('center_id', centerId).eq('status', 'active'),
    supabase.from('payments').select('student_id, amount, payment_date').eq('center_id', centerId),
  ]);
  const groupRows = groups ?? []; const paymentRows = payments ?? []; const studentRows = students ?? [];
  const ids = groupRows.map(g => g.id);
  const [{ data: memberships = [] }, { data: attendance = [] }] = ids.length ? await Promise.all([
    supabase.from('group_students').select('group_id, student_id, status').in('group_id', ids),
    supabase.from('attendance').select('student_id, status, date').in('group_id', ids),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }];
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const attendanceRows = attendance ?? []; const membershipRows = memberships ?? [];
  const date = (d: Date) => d.toISOString().slice(0, 10); const revenueOf = (from: Date, before?: Date) => paymentRows.filter(p => p.payment_date >= date(from) && (!before || p.payment_date < date(before))).reduce((sum,p) => sum + Number(p.amount), 0);
  const revenue = revenueOf(monthStart); const previous = revenueOf(previousStart, monthStart);
  const studentsRisk = studentRows.filter(s => s.status === 'active').map(student => {
    const records = attendanceRows.filter(a => a.student_id === student.id); const last = records.map(a => a.date).sort().at(-1); const lastDate = last ? new Date(last) : now;
    const rate = records.length ? Math.round(records.filter(a => a.status === 'present' || a.status === 'late').length / records.length * 100) : 100;
    const enrolled = membershipRows.filter(m => m.student_id === student.id && m.status === 'active'); const expected = enrolled.reduce((sum,m) => sum + Number(groupRows.find(g => g.id === m.group_id)?.price || 0), 0);
    const paid = paymentRows.some(p => p.student_id === student.id && p.payment_date >= date(monthStart));
    const result = calculateStudentRisk({ attendanceRate: rate, daysSinceLastActivity: Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / 86400000)), overdueAmount: paid ? 0 : expected, recentPaymentRatio: paid ? 1 : 0, recentAbsenceRate: records.filter(a => a.status === 'absent').length / Math.max(1, records.length) });
    return { id:student.id, full_name:student.full_name, score:result.score, level:result.level, reasons:result.reasons };
  });
  return { revenue, revenueChange: previous ? Math.round((revenue - previous) / previous * 100) : 0, attendanceRate: attendanceRows.length ? Math.round(attendanceRows.filter(a => a.status === 'present' || a.status === 'late').length / attendanceRows.length * 100) : 0, totalGroups:groupRows.length, lowCapacityGroups:groupRows.filter(g => !membershipRows.some(m => m.group_id === g.id && m.status === 'active')).length, riskSummary:{low:studentsRisk.filter(s=>s.level==='LOW').length,medium:studentsRisk.filter(s=>s.level==='MEDIUM').length,high:studentsRisk.filter(s=>s.level==='HIGH').length}, students:studentsRisk };
}
