import { supabase } from '../lib/supabase';

/* =========================================================
   TYPES
========================================================= */

export type GeminiHealthLevel =
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown';

export type GeminiLocale = 'uz' | 'ru' | 'en';

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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CenterStudentRecord {
  id: string;
  center_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  groups?: Array<{
    id: string;
    name: string;
    course_id: string | null;
    teacher_id: string | null;
    price: number | null;
    schedule: unknown;
    status: string | null;
  }>;
}

export interface CenterGroupRecord {
  id: string;
  center_id: string;
  course_id: string | null;
  teacher_id: string | null;
  name: string;
  room: string | null;
  price: number | null;
  schedule: unknown;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  student_count: number;
  student_ids: string[];
  course: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  teacher: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

/*
 * Muhim: eski komponentlar foydalanayotgan summary maydonlari
 * saqlanadi. Yangi real database ma'lumotlari esa shu interface
 * ichidagi qo'shimcha maydonlarda beriladi.
 */
export interface CenterChatContext {
  centerName: string;

  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;

  attendanceRate: number;

  revenue: number;
  revenueChange: number;

  overdue: number;

  totalGroups: number;
  lowCapacityGroups: number;

  riskSummary: {
    low: number;
    medium: number;
    high: number;
  };

  center: {
    id: string;
    name: string;
  } | null;

  students: CenterStudentRecord[];
  groups: CenterGroupRecord[];
  courses: Array<Record<string, unknown>>;
  groupStudents: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  teachers: Array<Record<string, unknown>>;
  centerMembers: Array<Record<string, unknown>>;
  subscriptions: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;

  todayAttendance: {
    date: string;
    available: boolean;
    records: Array<{
      studentId: string;
      studentName: string;
      groupId: string;
      groupName: string;
      status: string;
      note: string | null;
    }>;
    present: number;
    absent: number;
    late: number;
    other: number;
    total: number;
  };

  debtDataAvailable: false;
  overdueAvailable: false;
  groupCapacityAvailable: false;

  statistics: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    totalGroups: number;
    activeGroups: number;
    totalCourses: number;
    totalTeachers: number;
    totalPayments: number;
    totalRevenue: number;
    attendanceRate: number;
    attendanceRecords: number;
    paymentWindow: {
      currentStart: string;
      currentEnd: string;
      previousStart: string;
      previousEnd: string;
      currentRevenue: number;
      previousRevenue: number;
      changePercent: number;
    };
    emptyGroups: number;
  };

  derived: {
    studentAttendance: Array<{
      studentId: string;
      studentName: string;
      records: number;
      present: number;
      absent: number;
      late: number;
      attendanceRate: number;
      risk: 'low' | 'medium' | 'high' | 'unknown';
    }>;
    emptyGroups: Array<{
      groupId: string;
      groupName: string;
    }>;
  };

  [key: string]: unknown;
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function normalizeLocale(locale?: string): GeminiLocale {
  const value = String(locale || '').toLowerCase();

  if (value.startsWith('ru')) return 'ru';
  if (value.startsWith('en')) return 'en';

  return 'uz';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function startOfDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return startOfDay(date);
}

function addMonths(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + amount);
  return startOfDay(date);
}

function numeric(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

async function fetchRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/* =========================================================
   CENTER RESOLUTION
========================================================= */

async function resolveCenter(
  explicitCenterId?: string,
  explicitCenterName?: string,
): Promise<{ id: string; name: string }> {
  if (explicitCenterId) {
    const { data, error } = await supabase
      .from('centers')
      .select('id, name')
      .eq('id', explicitCenterId)
      .maybeSingle();

    if (error) {
      throw new Error(`Markazni olishda xato: ${error.message}`);
    }

    if (!data?.id) {
      throw new Error('Ko‘rsatilgan markaz topilmadi.');
    }

    return {
      id: String(data.id),
      name: String(data.name || explicitCenterName || 'Velia'),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Foydalanuvchi tizimga kirmagan.');
  }

  const { data: ownedCenter, error: ownerError } = await supabase
    .from('centers')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    throw new Error(`Markazni aniqlab bo‘lmadi: ${ownerError.message}`);
  }

  if (ownedCenter?.id) {
    return {
      id: String(ownedCenter.id),
      name: String(ownedCenter.name || 'Velia'),
    };
  }

  const { data: member, error: memberError } = await supabase
    .from('center_members')
    .select('center_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Markaz a'zoligi aniqlanmadi: ${memberError.message}`);
  }

  if (!member?.center_id) {
    throw new Error('Foydalanuvchiga biriktirilgan markaz topilmadi.');
  }

  const { data: memberCenter, error: memberCenterError } = await supabase
    .from('centers')
    .select('id, name')
    .eq('id', member.center_id)
    .maybeSingle();

  if (memberCenterError || !memberCenter) {
    throw new Error(
      memberCenterError?.message || 'Biriktirilgan markaz topilmadi.',
    );
  }

  return {
    id: String(memberCenter.id),
    name: String(memberCenter.name || 'Velia'),
  };
}

/* =========================================================
   REAL CENTER CONTEXT
========================================================= */

export async function buildDirectorContext(
  centerId?: string,
  centerName?: string,
): Promise<CenterChatContext> {
  const center = await resolveCenter(centerId, centerName);

  const [students, courses, groups, payments, centerMembers, subscriptions, messages] =
    await Promise.all([
      fetchRows(
        supabase
          .from('students')
          .select(
            'id, center_id, full_name, phone, email, birth_date, status, notes, created_at, updated_at',
          )
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(2500),
      ),
      fetchRows(
        supabase
          .from('courses')
          .select('*')
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(2500),
      ),
      fetchRows(
        supabase
          .from('groups')
          .select('*')
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(2500),
      ),
      fetchRows(
        supabase
          .from('payments')
          .select('*')
          .eq('center_id', center.id)
          .order('payment_date', { ascending: false })
          .limit(10000),
      ),
      fetchRows(
        supabase
          .from('center_members')
          .select('*')
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(2500),
      ),
      fetchRows(
        supabase
          .from('center_subscriptions')
          .select('*')
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(100),
      ),
      fetchRows(
        supabase
          .from('student_messages')
          .select('*')
          .eq('center_id', center.id)
          .order('created_at', { ascending: false })
          .limit(1000),
      ),
    ]);

  const typedStudents = students as CenterStudentRecord[];
  const typedGroups = groups as Array<Record<string, unknown>>;
  const groupIds = typedGroups
    .map((group) => String(group.id || ''))
    .filter(Boolean);

  const groupStudentChunks = chunk(groupIds, 500);
  const groupStudentResults = await Promise.all(
    groupStudentChunks.map((ids) =>
      fetchRows(
        supabase
          .from('group_students')
          .select('*')
          .in('group_id', ids)
          .limit(10000),
      ),
    ),
  );
  const groupStudents = groupStudentResults.flat() as Array<Record<string, unknown>>;

  const attendanceResults = await Promise.all(
    groupStudentChunks.map((ids) =>
      fetchRows(
        supabase
          .from('attendance')
          .select('*')
          .in('group_id', ids)
          .limit(20000),
      ),
    ),
  );
  const attendance = attendanceResults.flat() as Array<Record<string, unknown>>;

  /*
   * groups.teacher_id -> profiles.id
   * profiles'dan faqat real teacher IDlar olinadi.
   */
  const teacherIds = [
    ...new Set(
      typedGroups
        .map((group) => String(group.teacher_id || ''))
        .filter(Boolean),
    ),
  ];

  const teacherResults = await Promise.all(
    chunk(teacherIds, 500).map((ids) =>
      fetchRows(
        supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, preferred_language')
          .in('id', ids)
          .limit(2500),
      ),
    ),
  );
  const teachers = teacherResults.flat() as Array<Record<string, unknown>>;

  /* =======================================================
     GROUP DETAILS
  ======================================================= */

  const typedGroupStudents = groupStudents;
  const typedCourses = courses as Array<Record<string, unknown>>;

  const groupDetails: CenterGroupRecord[] = typedGroups.map((group) => {
    const groupId = String(group.id);
    const members = typedGroupStudents.filter(
      (item) => String(item.group_id || '') === groupId,
    );

    const course = typedCourses.find(
      (item) => String(item.id || '') === String(group.course_id || ''),
    );

    const teacher = teachers.find(
      (item) => String(item.id || '') === String(group.teacher_id || ''),
    );

    return {
      id: groupId,
      center_id: center.id,
      course_id: group.course_id ? String(group.course_id) : null,
      teacher_id: group.teacher_id ? String(group.teacher_id) : null,
      name: String(group.name || ''),
      room: group.room == null ? null : String(group.room),
      price: group.price == null ? null : numeric(group.price),
      schedule: group.schedule ?? null,
      status: group.status == null ? null : String(group.status),
      created_at: group.created_at == null ? null : String(group.created_at),
      updated_at: group.updated_at == null ? null : String(group.updated_at),
      student_count: members.length,
      student_ids: members.map((item) => String(item.student_id || '')).filter(Boolean),
      course: course
        ? {
            id: String(course.id),
            name: String(course.name || ''),
            description: course.description == null ? null : String(course.description),
          }
        : null,
      teacher: teacher
        ? {
            id: String(teacher.id),
            full_name: teacher.full_name == null ? null : String(teacher.full_name),
            email: teacher.email == null ? null : String(teacher.email),
          }
        : null,
    };
  });

  /* =======================================================
     STUDENT DETAILS
  ======================================================= */

  const studentsWithGroups: CenterStudentRecord[] = typedStudents.map((student) => {
    const memberships = typedGroupStudents.filter(
      (item) => String(item.student_id || '') === String(student.id),
    );

    const studentGroups = memberships
      .map((membership) =>
        groupDetails.find(
          (group) => group.id === String(membership.group_id || ''),
        ),
      )
      .filter((group): group is CenterGroupRecord => Boolean(group));

    return {
      ...student,
      groups: studentGroups.map((group) => ({
        id: group.id,
        name: group.name,
        course_id: group.course_id,
        teacher_id: group.teacher_id,
        price: group.price,
        schedule: group.schedule,
        status: group.status,
      })),
    };
  });

  /* =======================================================
     TODAY ATTENDANCE
  ======================================================= */

  const today = startOfDay();
  const todayRecords = attendance.filter(
    (item) => String(item.date || '') === today,
  );

  const todayDetailed = todayRecords.map((item) => {
    const student = typedStudents.find(
      (row) => String(row.id) === String(item.student_id || ''),
    );
    const group = groupDetails.find(
      (row) => row.id === String(item.group_id || ''),
    );

    return {
      studentId: String(item.student_id || ''),
      studentName: String(student?.full_name || 'Noma’lum'),
      groupId: String(item.group_id || ''),
      groupName: String(group?.name || 'Noma’lum guruh'),
      status: String(item.status || 'unknown'),
      note: item.note == null ? null : String(item.note),
    };
  });

  const statusCounts = todayDetailed.reduce(
    (result, item) => {
      const normalized = item.status.toLowerCase();

      if (normalized === 'present' || normalized === 'presented') {
        result.present += 1;
      } else if (normalized === 'absent') {
        result.absent += 1;
      } else if (normalized === 'late' || normalized === 'kechikdi') {
        result.late += 1;
      } else {
        result.other += 1;
      }

      result.total += 1;
      return result;
    },
    { present: 0, absent: 0, late: 0, other: 0, total: 0 },
  );

  /* =======================================================
     OVERALL ATTENDANCE
  ======================================================= */

  const recognizedAttendance = attendance.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    return (
      status === 'present' ||
      status === 'absent' ||
      status === 'late' ||
      status === 'kechikdi'
    );
  });

  const successfulAttendance = recognizedAttendance.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    return status === 'present' || status === 'late' || status === 'kechikdi';
  }).length;

  const attendanceRate = recognizedAttendance.length
    ? Number(((successfulAttendance / recognizedAttendance.length) * 100).toFixed(1))
    : 0;

  /* =======================================================
     STUDENT ATTENDANCE / RISK
  ======================================================= */

  const studentAttendance = studentsWithGroups.map((student) => {
    const records = attendance.filter(
      (item) => String(item.student_id || '') === String(student.id),
    );

    const present = records.filter((item) => {
      const status = String(item.status || '').toLowerCase();
      return status === 'present';
    }).length;

    const late = records.filter((item) => {
      const status = String(item.status || '').toLowerCase();
      return status === 'late' || status === 'kechikdi';
    }).length;

    const absent = records.filter((item) => {
      const status = String(item.status || '').toLowerCase();
      return status === 'absent';
    }).length;

    const counted = present + late + absent;
    const rate = counted
      ? Number((((present + late) / counted) * 100).toFixed(1))
      : 0;

    let risk: 'low' | 'medium' | 'high' | 'unknown' = 'unknown';

    if (counted >= 3) {
      if (rate < 60) risk = 'high';
      else if (rate < 80) risk = 'medium';
      else risk = 'low';
    }

    return {
      studentId: String(student.id),
      studentName: String(student.full_name || ''),
      records: counted,
      present,
      absent,
      late,
      attendanceRate: rate,
      risk,
    };
  });

  const riskSummary = studentAttendance.reduce(
    (result, item) => {
      if (item.risk === 'high') result.high += 1;
      else if (item.risk === 'medium') result.medium += 1;
      else if (item.risk === 'low') result.low += 1;
      return result;
    },
    { low: 0, medium: 0, high: 0 },
  );

  /* =======================================================
     REVENUE + REVENUE CHANGE
  =======================================================

     Revenue uchun payment_date ishlatiladi.
     Bu overdue/debt hisoblash emas.
  ======================================================= */

  const currentEnd = today;
  const currentStart = addDays(currentEnd, -29);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -29);

  const paymentRows = payments as Array<Record<string, unknown>>;
  const totalRevenue = paymentRows.reduce(
    (sum, payment) => sum + numeric(payment.amount),
    0,
  );

  const currentRevenue = paymentRows.reduce((sum, payment) => {
    const date = String(payment.payment_date || '').slice(0, 10);
    if (date >= currentStart && date <= currentEnd) {
      return sum + numeric(payment.amount);
    }
    return sum;
  }, 0);

  const previousRevenue = paymentRows.reduce((sum, payment) => {
    const date = String(payment.payment_date || '').slice(0, 10);
    if (date >= previousStart && date <= previousEnd) {
      return sum + numeric(payment.amount);
    }
    return sum;
  }, 0);

  const revenueChange = previousRevenue === 0
    ? currentRevenue === 0
      ? 0
      : 100
    : Number((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1));

  /* =======================================================
     ACTIVE / INACTIVE
  ======================================================= */

  const activeStudents = studentsWithGroups.filter((student) =>
    String(student.status || '').toLowerCase() === 'active',
  ).length;

  const inactiveStudents = studentsWithGroups.length - activeStudents;

  const activeGroups = groupDetails.filter((group) =>
    String(group.status || '').toLowerCase() === 'active',
  ).length;

  const emptyGroupDetails = groupDetails
    .filter((group) => group.student_count === 0)
    .map((group) => ({
      groupId: group.id,
      groupName: group.name,
    }));

  /*
   * groups jadvalida capacity maydoni yo'q.
   * Shuning uchun lowCapacityGroups'ni taxmin qilmaymiz.
   */
  const lowCapacityGroups = 0;
  const overdue = 0;

  return {
    centerName: center.name,

    totalStudents: studentsWithGroups.length,
    activeStudents,
    inactiveStudents,

    attendanceRate,

    revenue: totalRevenue,
    revenueChange,

    overdue,

    totalGroups: groupDetails.length,
    lowCapacityGroups,

    riskSummary,

    center,

    students: studentsWithGroups,
    groups: groupDetails,
    courses: typedCourses,
    groupStudents,
    attendance,
    payments: paymentRows,
    teachers,
    centerMembers: centerMembers as Array<Record<string, unknown>>,
    subscriptions: subscriptions as Array<Record<string, unknown>>,
    messages: messages as Array<Record<string, unknown>>,

    todayAttendance: {
      date: today,
      available: true,
      records: todayDetailed,
      present: statusCounts.present,
      absent: statusCounts.absent,
      late: statusCounts.late,
      other: statusCounts.other,
      total: statusCounts.total,
    },

    debtDataAvailable: false,
    overdueAvailable: false,
    groupCapacityAvailable: false,

    statistics: {
      totalStudents: studentsWithGroups.length,
      activeStudents,
      inactiveStudents,
      totalGroups: groupDetails.length,
      activeGroups,
      totalCourses: typedCourses.length,
      totalTeachers: teachers.length,
      totalPayments: paymentRows.length,
      totalRevenue,
      attendanceRate,
      attendanceRecords: recognizedAttendance.length,
      paymentWindow: {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        currentRevenue,
        previousRevenue,
        changePercent: revenueChange,
      },
      emptyGroups: emptyGroupDetails.length,
    },

    derived: {
      studentAttendance,
      emptyGroups: emptyGroupDetails,
    },
  };
}

/* =========================================================
   RESPONSE VALIDATION
========================================================= */

export function validateGeminiResponse(
  payload: unknown,
): payload is GeminiStructuredResponse {
  if (!isRecord(payload)) return false;

  if (typeof payload.summary !== 'string') return false;

  if (
    !['good', 'warning', 'critical', 'unknown'].includes(
      String(payload.health),
    )
  ) {
    return false;
  }

  if (!Array.isArray(payload.insights)) return false;
  if (!Array.isArray(payload.recommendedActions)) return false;

  return true;
}

/* =========================================================
   LOCAL DASHBOARD FALLBACK
========================================================= */

export function buildLocalFallbackInsight(
  context: Record<string, unknown>,
  locale?: string,
): GeminiStructuredResponse {
  const language = normalizeLocale(locale);

  const totalStudents = numeric(context.totalStudents);
  const activeStudents = numeric(context.activeStudents);
  const inactiveStudents = numeric(context.inactiveStudents);
  const attendance = numeric(
    context.attendanceRate ?? context.attendance,
  );
  const overdueAvailable = Boolean(context.overdueAvailable);
  const overdue = numeric(context.overdue);

  const insights: GeminiInsightItem[] = [];

  if (overdueAvailable && overdue > 0) {
    const copy = {
      uz: {
        title: 'Muddati o‘tgan to‘lovlar mavjud',
        description: `${overdue} ta muddati o‘tgan to‘lov mavjud.`,
        action: 'Qarzdorlik ma’lumotlarini tekshiring va to‘lov eslatmalarini yuboring.',
      },
      ru: {
        title: 'Есть просроченные платежи',
        description: `Просрочено платежей: ${overdue}.`,
        action: 'Проверьте задолженности и отправьте напоминания.',
      },
      en: {
        title: 'Overdue payments exist',
        description: `${overdue} overdue payments are present.`,
        action: 'Review overdue accounts and send reminders.',
      },
    }[language];

    insights.push({
      type: 'payment',
      severity: 'high',
      ...copy,
      relatedIds: [],
    });
  }

  if (attendance > 0 && attendance < 80) {
    const copy = {
      uz: {
        title: 'Davomat past',
        description: `Qayd etilgan davomat ${attendance}%.`,
        action: 'Davomati past o‘quvchilar va guruhlarni tahlil qiling.',
      },
      ru: {
        title: 'Посещаемость низкая',
        description: `Зафиксированная посещаемость: ${attendance}%.`,
        action: 'Проверьте учеников и группы с низкой посещаемостью.',
      },
      en: {
        title: 'Attendance is low',
        description: `Recorded attendance is ${attendance}%.`,
        action: 'Review students and groups with low attendance.',
      },
    }[language];

    insights.push({
      type: 'attendance',
      severity: 'medium',
      ...copy,
      relatedIds: [],
    });
  }

  if (inactiveStudents > 0) {
    const copy = {
      uz: {
        title: 'Nofaol o‘quvchilar mavjud',
        description: `${inactiveStudents} nafar o‘quvchi nofaol holatda.`,
        action: 'Nofaol o‘quvchilarni tekshirib, qayta aloqa qiling.',
      },
      ru: {
        title: 'Есть неактивные ученики',
        description: `${inactiveStudents} учеников имеют неактивный статус.`,
        action: 'Проверьте неактивных учеников и свяжитесь с ними.',
      },
      en: {
        title: 'Inactive students exist',
        description: `${inactiveStudents} students have an inactive status.`,
        action: 'Review inactive students and follow up with them.',
      },
    }[language];

    insights.push({
      type: 'retention',
      severity: 'medium',
      ...copy,
      relatedIds: [],
    });
  }

  const copy = {
    uz: {
      summary: 'AI vaqtincha javob bermadi. Ko‘rsatilgan tahlil mavjud real markaz ma’lumotlari asosida tuzildi.',
      stable: 'Mavjud ko‘rsatkichlarda aniq kritik signal aniqlanmadi.',
    },
    ru: {
      summary: 'AI временно не ответил. Анализ составлен на основе доступных реальных данных центра.',
      stable: 'По доступным данным явный критический сигнал не обнаружен.',
    },
    en: {
      summary: 'AI did not respond temporarily. The analysis uses the available real center data.',
      stable: 'No clear critical signal was detected from the available data.',
    },
  }[language];

  if (!insights.length) {
    insights.push({
      type: 'operations',
      severity: 'low',
      title:
        language === 'ru'
          ? 'По доступным данным критический сигнал не найден'
          : language === 'en'
            ? 'No critical signal found in the available data'
            : 'Mavjud ma’lumotlarda kritik signal aniqlanmadi',
      description: copy.stable,
      action:
        language === 'ru'
          ? 'Продолжайте регулярно контролировать показатели центра.'
          : language === 'en'
            ? 'Continue regular monitoring of center metrics.'
            : 'Markaz ko‘rsatkichlarini muntazam nazorat qiling.',
      relatedIds: [],
    });
  }

  return {
    summary: copy.summary,
    health: insights.some((item) => item.severity === 'high')
      ? 'warning'
      : 'good',
    insights,
    recommendedActions: insights.map((item, index) => ({
      priority: index + 1,
      title: item.title,
      description: item.action,
      actionType: item.type,
    })),
  };
}

/* =========================================================
   CHAT PROMPT
========================================================= */

function buildChatSystemPrompt(
  context: CenterChatContext,
  locale: GeminiLocale,
): string {
  const language =
    locale === 'ru'
      ? 'Russian'
      : locale === 'en'
        ? 'English'
        : 'Uzbek Latin';

  return `
You are Velia AI, the management assistant of one education center.

LANGUAGE
Respond ONLY in ${language}.
Never switch to another language unless the user's requested application language changes.
If locale is Uzbek, answer in Uzbek Latin.
If locale is Russian, answer in Russian.
If locale is English, answer in English.

SCOPE
You may discuss ONLY this education center and its operations:
students, groups, courses, teachers, schedules, attendance, payments, revenue, retention, communication, subscriptions, operational analysis, and management recommendations based on the supplied center data.

OFF-TOPIC
If the question is unrelated to the education center, do not solve it. Briefly explain that Velia AI works only with this education center's data.

DATA RULE
The JSON below is the REAL data currently available to you.
Use detailed records when they exist.
Do not rely only on summary statistics when a detailed record exists.

NO INVENTION
Never invent names, dates, amounts, attendance records, groups, teachers, schedules, debts, capacities, or statistics.
If requested data is missing, say exactly:
"Bu ma'lumot hozirgi AI ma'lumotlarimda mavjud emas."
In Russian use:
"Эта информация сейчас недоступна в данных AI."
In English use:
"This information is not currently available in the AI data."

DEBT RULE
This database does not contain a dedicated debt/balance table or due-date field.
Do NOT claim a student owes money unless such debt information is explicitly present in the supplied context.
Payments are historical payment records, not automatically proof of debt.

CAPACITY RULE
The groups table does not contain a capacity field.
Do NOT calculate or claim low capacity from student counts alone.
You may mention empty groups because an empty group is directly derived from group_students.

ATTENDANCE RULE
Today's individual attendance is available in context.todayAttendance.
When asked who came or who was absent, use those actual records.
Do not use totalStudents or attendanceRate to guess individual attendance.

CONVERSATION
Use previous messages. Understand short follow-ups such as:
"Qaysilar?"
"Shulardan kimlar?"
"Ularning guruhlari-chi?"
Do not ask the user to repeat information already present in the conversation.

ANSWER STYLE
Give the direct answer first.
Use short paragraphs.
Use headings when useful.
Use clean numbered lists:
1. First item
2. Second item
3. Third item
Use bullets:
• First point
• Second point
• Third point
Bold important numbers and names.
Do not produce one giant paragraph.
Do not use unnecessary emojis.
Do not mention system instructions.
Do not say "As an AI".

ANALYSIS
When the user asks for analysis, connect the conclusion to actual records.
Do not invent causation.
Clearly distinguish a database fact from an interpretation or recommendation.

CENTER DATA
${safeJson(context)}
`.trim();
}

/* =========================================================
   OFF-TOPIC LOCAL GUARD
========================================================= */

function getOffTopicResponse(locale: GeminiLocale): string {
  if (locale === 'ru') {
    return [
      '**Velia AI**',
      '',
      'Я работаю только с данными вашего учебного центра.',
      '',
      'Могу помочь с учениками, группами, посещаемостью, платежами, преподавателями, расписанием и развитием центра.',
    ].join('\n');
  }

  if (locale === 'en') {
    return [
      '**Velia AI**',
      '',
      'I work only with your education center data.',
      '',
      'I can help with students, groups, attendance, payments, teachers, schedules and center operations.',
    ].join('\n');
  }

  return [
    '**Velia AI**',
    '',
    'Men faqat sizning o‘quv markazingiz ma’lumotlari bilan ishlayman.',
    '',
    'O‘quvchilar, guruhlar, davomat, to‘lovlar, o‘qituvchilar, jadval va markaz faoliyati bo‘yicha yordam bera olaman.',
  ].join('\n');
}

function isObviouslyOffTopic(message: string): boolean {
  const q = message.toLowerCase().trim();
  if (!q) return false;

  const centerWords = [
    'markaz', 'o‘quv', "o'quv", 'oquvchi', 'o‘quvchi',
    'davomat', 'guruh', 'guruhlar', 'to‘lov', "to'lov",
    'qarz', 'qarzdor', 'daromad', 'tushum', 'o‘qituvchi',
    "o'qituvchi", 'dars', 'jadval', 'o‘sish', "o'sish",
    'rivoj', 'student', 'students', 'attendance', 'group',
    'groups', 'payment', 'payments', 'debt', 'revenue',
    'teacher', 'schedule', 'lesson', 'center', 'ученик',
    'ученики', 'посещ', 'группа', 'оплат', 'долг', 'доход',
    'учитель', 'распис', 'занят', 'центр',
  ];

  const centerTopic = centerWords.some((word) => q.includes(word));
  if (centerTopic) return false;

  const offTopicWords = [
    'ob-havo', 'weather', 'погод', 'futbol', 'football', 'футбол',
    'politika', 'politics', 'политик', 'bitcoin', 'crypto', 'крипт',
    'retsept', 'recipe', 'рецепт', 'javascript', 'typescript', 'python',
    'react', 'html', 'css', 'git', 'npm', 'sql', 'formula', 'формула',
  ];

  return offTopicWords.some((word) => q.includes(word));
}

/* =========================================================
   SAFE CONTEXT COPY
========================================================= */

function sanitizeContext(
  context: CenterChatContext,
): Record<string, unknown> {
  try {
    const source = JSON.parse(JSON.stringify(context)) as Record<string, unknown>;

    // Keep only data useful for center analysis. Do not send direct contact or
    // personal fields such as phone, email, birth date, or internal notes.
    if (Array.isArray(source.students)) {
      source.students = source.students.map((student) => {
        if (!student || typeof student !== 'object') return student;
        const row = { ...(student as Record<string, unknown>) };
        delete row.phone;
        delete row.email;
        delete row.birth_date;
        delete row.notes;

        if (Array.isArray(row.groups)) {
          row.groups = row.groups.map((group) => {
            if (!group || typeof group !== 'object') return group;
            const g = { ...(group as Record<string, unknown>) };
            return {
              id: g.id,
              name: g.name,
              course_id: g.course_id ?? null,
              teacher_id: g.teacher_id ?? null,
              price: g.price ?? null,
              schedule: g.schedule ?? null,
              status: g.status ?? null,
            };
          });
        }

        return row;
      });
    }

    if (Array.isArray(source.groups)) {
      source.groups = source.groups.map((group) => {
        if (!group || typeof group !== 'object') return group;
        const g = { ...(group as Record<string, unknown>) };
        if (g.teacher && typeof g.teacher === 'object') {
          const teacher = g.teacher as Record<string, unknown>;
          g.teacher = {
            id: teacher.id,
            full_name: teacher.full_name ?? null,
          };
        }
        if (g.course && typeof g.course === 'object') {
          const course = g.course as Record<string, unknown>;
          g.course = {
            id: course.id,
            name: course.name,
            description: course.description ?? null,
          };
        }
        return g;
      });
    }

    if (Array.isArray(source.teachers)) {
      source.teachers = source.teachers.map((teacher) => {
        if (!teacher || typeof teacher !== 'object') return teacher;
        const t = teacher as Record<string, unknown>;
        return {
          id: t.id,
          full_name: t.full_name ?? null,
        };
      });
    }

    if (Array.isArray(source.centerMembers)) {
      source.centerMembers = source.centerMembers.map((member) => {
        if (!member || typeof member !== 'object') return member;
        const m = member as Record<string, unknown>;
        return {
          id: m.id,
          role: m.role ?? null,
          status: m.status ?? null,
        };
      });
    }

    // Payment amounts/dates are useful for analysis; keep a bounded recent set.
    if (Array.isArray(source.payments)) {
      source.payments = source.payments.slice(0, 500).map((payment) => {
        if (!payment || typeof payment !== 'object') return payment;
        const row = payment as Record<string, unknown>;
        return {
          id: row.id,
          student_id: row.student_id ?? null,
          group_id: row.group_id ?? null,
          amount: row.amount ?? null,
          payment_date: row.payment_date ?? null,
          status: row.status ?? null,
        };
      });
    }

    // The full historical attendance table can be very large. The context already
    // contains today's detailed attendance + derived student attendance metrics.
    if (Array.isArray(source.attendance)) {
      source.attendance = source.attendance.slice(-5000);
    }

    // Message bodies are not required for analytics and may contain personal text.
    source.messages = [];

    return source;
  } catch {
    return {
      centerName: context.centerName,
      center: context.center,
      totalStudents: context.totalStudents,
      activeStudents: context.activeStudents,
      inactiveStudents: context.inactiveStudents,
      attendanceRate: context.attendanceRate,
      revenue: context.revenue,
      revenueChange: context.revenueChange,
      overdue: context.overdue,
      overdueAvailable: context.overdueAvailable,
      totalGroups: context.totalGroups,
      lowCapacityGroups: context.lowCapacityGroups,
      groupCapacityAvailable: context.groupCapacityAvailable,
      riskSummary: context.riskSummary,
      statistics: context.statistics,
      todayAttendance: context.todayAttendance,
      derived: context.derived,
    };
  }
}
/* =========================================================
   CHAT
========================================================= */

export async function chatWithCenterAI(
  messages: ChatMessage[],
  context: CenterChatContext,
  locale?: string,
): Promise<string> {
  const language = normalizeLocale(locale);
  const cleanContext = sanitizeContext(context);
  const recentMessages = messages
    .filter(
      (message) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim(),
    )
    .slice(-40);

  const lastUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === 'user')?.content || '';

  if (isObviouslyOffTopic(lastUserMessage)) {
    return getOffTopicResponse(language);
  }

  try {
    const { data, error } = await supabase.functions.invoke<{
      text?: string;
      reply?: string;
      error?: string;
      details?: string;
    }>('gemini-director', {
      body: {
        mode: 'chat',
        messages: recentMessages,
        context: cleanContext,
        locale: language,
        systemPrompt: buildChatSystemPrompt(
          cleanContext as CenterChatContext,
          language,
        ),
      },
    });

    if (error) {
      console.error('Velia AI request failed:', error.message);
      throw new Error(error.message);
    }

    const reply = data?.reply || data?.text;

    if (typeof reply === 'string' && reply.trim()) {
      return normalizeAIResponse(reply.trim());
    }

    throw new Error(
      data?.details || data?.error || 'Velia AI bo‘sh javob qaytardi.',
    );
  } catch (error) {
    console.error('Velia AI unexpected error:', error);
    throw error instanceof Error
      ? error
      : new Error('Velia AI javobini olishda xatolik yuz berdi.');
  }
}

/* =========================================================
   AI RESPONSE NORMALIZER
========================================================= */

function normalizeAIResponse(response: string): string {
  let value = response
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  value = value.replace(
    /(^|\n)(\d{1,2})(?![\d.])\s*([^\n])/g,
    '$1$2. $3',
  );

  value = value.replace(
    /(^|\n)(\d{1,2})\)\s*/g,
    '$1$2. ',
  );

  value = value.replace(
    /(^|\n)[ \t]*[-*]\s+/g,
    '$1• ',
  );

  return value;
}

/* =========================================================
   DIRECTOR SUMMARY
========================================================= */

export async function generateDirectorSummary(
  context: Record<string, unknown>,
  locale?: string,
): Promise<GeminiStructuredResponse> {
  const language = normalizeLocale(locale);

  try {
    const safeContext = sanitizeContext(context as CenterChatContext);

    const { data, error } = await supabase.functions.invoke<GeminiStructuredResponse>(
      'gemini-director',
      {
        body: {
          mode: 'director',
          context: safeContext,
          locale: language,
        },
      },
    );

    if (!error && data && validateGeminiResponse(data)) {
      return data;
    }

    if (error) {
      console.error('Gemini Director error:', error.message);
    }
  } catch (error) {
    console.error('Gemini Director unexpected error:', error);
  }

  return buildLocalFallbackInsight(context, language);
}

export async function generateCenterHealthExplanation(
  context: Record<string, unknown>,
  locale?: string,
): Promise<string> {
  const result = await generateDirectorSummary(context, locale);
  return result.summary;
}

/* =========================================================
   STUDENT MESSAGE GENERATOR
========================================================= */

export interface StudentMessageContext {
  studentName: string;
  messageType?: string;
  type?: string;
  centerName?: string;
  amount?: number;
  debt?: number;
  attendanceRate?: number;
  locale?: string;
}

export async function generateStudentMessage(
  ctx: StudentMessageContext,
): Promise<string> {
  const language = normalizeLocale(ctx.locale);
  const name =
    ctx.studentName ||
    (language === 'ru'
      ? 'ученик'
      : language === 'en'
        ? 'student'
        : 'o‘quvchi');
  const center = ctx.centerName || 'Velia';
  const type = ctx.messageType || ctx.type || 'general';

  const templates: Record<string, Record<GeminiLocale, string>> = {
    debt_reminder: {
      uz: `Hurmatli ${name}!\n\n${center} o‘quv markazidan to‘lov bo‘yicha eslatma. Iltimos, to‘lov holatingizni tekshiring va kerak bo‘lsa markaz administratori bilan bog‘laning.`,
      ru: `Уважаемый(ая) ${name}!\n\nНапоминание от учебного центра ${center} по оплате. Пожалуйста, проверьте статус платежа и при необходимости свяжитесь с администратором.`,
      en: `Dear ${name}!\n\nThis is a payment reminder from ${center}. Please check your payment status and contact the center administrator if needed.`,
    },
    attendance_alert: {
      uz: `Hurmatli ${name}!\n\n${center} dagi davomat ko‘rsatkichingiz pasaygan. Darslarga muntazam qatnashishingizni so‘raymiz.`,
      ru: `Уважаемый(ая) ${name}!\n\nВ ${center} ваша посещаемость снизилась. Просим регулярно посещать занятия.`,
      en: `Dear ${name}!\n\nYour attendance at ${center} has decreased. Please attend classes regularly.`,
    },
    announcement: {
      uz: `Hurmatli ${name}!\n\n${center} o‘quv markazidan muhim e’lon mavjud. Iltimos, markaz yangiliklari va jadvaldagi o‘zgarishlarni tekshiring.`,
      ru: `Уважаемый(ая) ${name}!\n\nВ учебном центре ${center} есть важное объявление. Пожалуйста, проверьте новости и изменения расписания.`,
      en: `Dear ${name}!\n\nThere is an important announcement from ${center}. Please check the latest news and schedule changes.`,
    },
    praise: {
      uz: `Hurmatli ${name}!\n\n${center} jamoasi sizning faolligingiz va natijalaringizni qadrlaydi. Shu tempda davom eting!`,
      ru: `Уважаемый(ая) ${name}!\n\nКоманда ${center} отмечает вашу активность и результаты. Продолжайте в том же духе!`,
      en: `Dear ${name}!\n\nThe ${center} team appreciates your effort and results. Keep it up!`,
    },
    general: {
      uz: `Hurmatli ${name}!\n\n${center} o‘quv markazidan xabar. Qo‘shimcha ma’lumot uchun markaz bilan bog‘laning.`,
      ru: `Уважаемый(ая) ${name}!\n\nСообщение от учебного центра ${center}. Для получения подробной информации свяжитесь с центром.`,
      en: `Dear ${name}!\n\nMessage from ${center}. Contact the center for more information.`,
    },
  };

  return (templates[type] || templates.general)[language];
}
