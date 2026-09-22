import { supabase } from './supabase';
import { calculateStudentRisk, type RiskLevel } from '../services/risk';

export interface DirectorContext {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  attendanceRate: number;
  revenue: number;
  revenueChange: number;
  overdue: number;
  renewalsDueSoon: number;
  totalGroups: number;
  lowCapacityGroups: number;
  riskSummary: { low: number; medium: number; high: number };
  signalCount: number;
  health: 'good' | 'warning' | 'critical';
  students: Array<{ id: string; full_name: string; score: number; level: RiskLevel; reasons: string[] }>;
}

export async function buildDirectorContext(centerId: string): Promise<DirectorContext> {
  const [studentRes, groupRes, paymentRes, groupIdsRes] = await Promise.all([
    supabase.from('students').select('id, full_name, status').eq('center_id', centerId),
    supabase.from('groups').select('id, name, price, status').eq('center_id', centerId),
    supabase.from('payments').select('student_id, amount, payment_date').eq('center_id', centerId),
    supabase.from('groups').select('id').eq('center_id', centerId),
  ]);

  const students = studentRes.data || [];
  const groups = groupRes.data || [];
  const payments = paymentRes.data || [];
  const groupIds = (groupIdsRes.data || []).map((group) => group.id);
  let groupStudentRows: Array<{ group_id: string; student_id: string; status: string }> = [];
  let attendance: Array<{ student_id: string; status: string; date: string }> = [];

  if (groupIds.length > 0) {
    const [{ data: attendanceData, error: attendanceError }, { data: groupStudentData }] = await Promise.all([
      supabase
        .from('attendance')
        .select('student_id, status, date')
        .in('group_id', groupIds),
      supabase
        .from('group_students')
        .select('group_id, student_id, status')
        .in('group_id', groupIds),
    ]);

    if (!attendanceError) {
      attendance = attendanceData || [];
    }
    groupStudentRows = groupStudentData || [];
  }

  const activeStudents = students.filter((student) => student.status === 'active').length;
  const inactiveStudents = students.length - activeStudents;
  const totalRevenue = (payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activeGroups = groups.filter((group) => group.status === 'active');
  const expectedRevenue = activeGroups.reduce((sum, group) => sum + Number(group.price || 0), 0);
  const overdue = Math.max(0, expectedRevenue - totalRevenue);

  const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 };
  attendance.forEach((entry) => {
    const val = entry.status as keyof typeof attendanceCounts;
    if (Object.prototype.hasOwnProperty.call(attendanceCounts, val)) {
      attendanceCounts[val] += 1;
    }
  });
  const attendanceTotal = attendance.length || 1;
  const attendanceRate = Math.min(
    100,
    Math.max(0, Math.round(((attendanceCounts.present + attendanceCounts.late) / attendanceTotal) * 100))
  );

  const lowCapacityGroups = activeGroups.filter((group) => (
    groupStudentRows.filter((row) => row.group_id === group.id && row.status === 'active').length === 0
  )).length;

  const today = new Date();
  const currentPeriodStart = new Date(today);
  currentPeriodStart.setDate(today.getDate() - 30);
  const previousPeriodStart = new Date(today);
  previousPeriodStart.setDate(today.getDate() - 60);
  const currentPeriodRevenue = payments
    .filter((payment) => payment.payment_date >= currentPeriodStart.toISOString().slice(0, 10))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const previousPeriodRevenue = payments
    .filter((payment) => payment.payment_date >= previousPeriodStart.toISOString().slice(0, 10) && payment.payment_date < currentPeriodStart.toISOString().slice(0, 10))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const revenueChange = previousPeriodRevenue > 0
    ? Math.round(((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100)
    : 0;

  const riskItems = students.map((student) => {
    const studentAttendance = attendance.filter((entry) => entry.student_id === student.id);
    const studentPayments = payments.filter((payment) => payment.student_id === student.id);
    const attendanceScore = studentAttendance.length
      ? Math.round(((studentAttendance.filter((entry) => entry.status === 'present' || entry.status === 'late').length / studentAttendance.length) * 100))
      : 100;
    const lastActivityDate = studentAttendance.reduce((latest, entry) => entry.date > latest ? entry.date : latest, '');
    const daysSinceLastActivity = lastActivityDate
      ? Math.max(0, Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (24 * 3600 * 1000)))
      : Number.MAX_SAFE_INTEGER;
    const assessment = calculateStudentRisk({
      attendanceRate: attendanceScore,
      daysSinceLastActivity,
      overdueAmount: overdue > 0 ? 1 : 0,
      recentPaymentRatio: studentPayments.length > 0 ? 1 : 0,
      recentAbsenceRate: studentAttendance.filter((entry) => entry.status === 'absent').length / Math.max(1, studentAttendance.length),
    });

    return {
      id: student.id,
      full_name: student.full_name,
      score: assessment.score,
      level: assessment.level,
      reasons: assessment.reasons,
    };
  });

  const riskSummary = {
    low: riskItems.filter((item) => item.level === 'LOW').length,
    medium: riskItems.filter((item) => item.level === 'MEDIUM').length,
    high: riskItems.filter((item) => item.level === 'HIGH').length,
  };

  const signalCount = [
    riskSummary.high > 0,
    overdue > 0,
    attendanceRate < 85,
    totalRevenue <= 0,
    activeStudents < students.length,
  ].filter(Boolean).length;

  return {
    totalStudents: students.length,
    activeStudents,
    inactiveStudents,
    attendanceRate,
    revenue: totalRevenue,
    revenueChange,
    overdue,
    renewalsDueSoon: 0,
    totalGroups: groups.length,
    lowCapacityGroups,
    riskSummary,
    signalCount,
    health: riskSummary.high > 0 || attendanceRate < 75 ? 'critical' : attendanceRate < 90 || overdue > 0 ? 'warning' : 'good',
    students: riskItems,
  };
}
