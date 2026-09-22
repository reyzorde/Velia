export type Language = 'uz' | 'ru' | 'en';
export type Theme = 'light' | 'dark';
export type Role = 'owner' | 'admin' | 'teacher';
export type StudentStatus = 'active' | 'inactive';
export type GroupStatus = 'active' | 'inactive' | 'archived';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export type Plan = 'free' | 'monthly' | 'yearly';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  preferred_language: Language;
  theme: Theme;
  created_at: string;
  updated_at: string;
}

export interface Center {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CenterMember {
  id: string;
  center_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

export interface Student {
  id: string;
  center_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  status: StudentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  center_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  center_id: string;
  course_id: string | null;
  teacher_id: string | null;
  name: string;
  room: string | null;
  price: number;
  schedule: string | null;
  status: GroupStatus;
  created_at: string;
  updated_at: string;
}

export interface GroupStudent {
  id: string;
  group_id: string;
  student_id: string;
  joined_at: string;
  status: 'active' | 'left' | 'completed';
}

export interface Attendance {
  id: string;
  group_id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  center_id: string;
  student_id: string;
  group_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  note: string | null;
  created_at: string;
}

export interface CenterSubscription {
  id: string;
  center_id: string;
  plan: Plan;
  student_limit: number | null;
  started_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_groups: number;
  today_attendance: number;
  month_revenue: number;
  debtors_count: number;
}
