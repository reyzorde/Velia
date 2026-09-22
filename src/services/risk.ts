export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StudentRiskAssessment {
  score: number;
  level: RiskLevel;
  reasons: string[];
  summary: string;
}

export interface RiskInput {
  attendanceRate: number;
  daysSinceLastActivity: number;
  overdueAmount: number;
  recentPaymentRatio: number;
  courseProgress?: number;
  recentAbsenceRate: number;
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export function calculateStudentRisk(input: RiskInput): StudentRiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  if (input.attendanceRate < 85) {
    score += 35;
    reasons.push(`Attendance is ${input.attendanceRate}% which is below the healthy benchmark.`);
  } else if (input.attendanceRate >= 95) {
    score -= 8;
  }

  if (input.daysSinceLastActivity > 7) {
    score += 25;
    reasons.push(`The student has been inactive for ${input.daysSinceLastActivity} days.`);
  }

  if (input.overdueAmount > 0) {
    score += 20;
    reasons.push('Payment is overdue and requires attention.');
  }

  if (input.recentPaymentRatio < 0.7) {
    score += 15;
    reasons.push('Recent payment coverage is below target.');
  }

  if (typeof input.courseProgress === 'number' && input.courseProgress < 60) {
    score += 12;
    reasons.push('Course progress is behind the expected pace.');
  }

  if (input.recentAbsenceRate > 0.2) {
    score += 10;
    reasons.push('Absence rate has increased recently.');
  }

  if (input.attendanceRate > 92 && input.daysSinceLastActivity <= 7 && input.overdueAmount === 0 && input.recentPaymentRatio >= 0.8) {
    score -= 12;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = getRiskLevel(normalizedScore);

  const summary = `Risk score is ${normalizedScore}% (${level}). This is a data-based projection and should be reviewed together with recent center activity.`;

  return {
    score: normalizedScore,
    level,
    reasons: reasons.length ? reasons : ['No major risk signals were detected from the available data.'],
    summary,
  };
}

export function getRiskFactors(risk: StudentRiskAssessment): string[] {
  return risk.reasons;
}

export function getHighRiskStudents(items: Array<{ score: number }>): Array<{ score: number }> {
  return items.filter((item) => item.score >= 70);
}
