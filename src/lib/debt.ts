import { supabase } from './supabase';

/**
 * Debt model (MVP):
 * expected = sum of active group prices the student is enrolled in
 * paid = sum of all payments for the student
 * debt = max(0, expected - paid)
 */
export async function getStudentDebt(studentId: string): Promise<{
  expected: number;
  paid: number;
  debt: number;
}> {
  const [{ data: enrollments }, { data: payments }] = await Promise.all([
    supabase
      .from('group_students')
      .select('group_id, groups(price, status)')
      .eq('student_id', studentId)
      .eq('status', 'active'),
    supabase.from('payments').select('amount').eq('student_id', studentId),
  ]);

  let expected = 0;
  for (const row of enrollments || []) {
    const g = Array.isArray((row as any).groups)
      ? (row as any).groups[0]
      : (row as any).groups;
    if (g && g.status === 'active') {
      expected += Number(g.price) || 0;
    }
  }

  const paid = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const debt = Math.max(0, expected - paid);
  return { expected, paid, debt };
}

export async function getCenterDebtors(centerId: string): Promise<
  { student_id: string; full_name: string; debt: number; paid: number; expected: number }[]
> {
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('center_id', centerId)
    .eq('status', 'active');

  if (!students?.length) return [];

  const results = await Promise.all(
    students.map(async (s) => {
      const d = await getStudentDebt(s.id);
      return {
        student_id: s.id,
        full_name: s.full_name,
        ...d,
      };
    })
  );

  return results.filter((r) => r.debt > 0).sort((a, b) => b.debt - a.debt);
}
