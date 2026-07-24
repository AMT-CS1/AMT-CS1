// Shapes mirrored from backend/app/schemas/amt_reports.py
// AMT-CS1 native interaction reports (the `attempts` data).

export interface AmtAttempt {
  id: string;
  timestamp: string;
  passed: boolean | null;
  confidence_level: number | null;
  misconception_tags: string[];
}

export interface AmtProblemDetail {
  task_ref: string;
  title: string | null;
  attempts_count: number;
  solved: boolean;
  first_solved_at: string | null;
  attempts: AmtAttempt[];
}

export interface AmtMisconceptionStat {
  tag: string;
  name: string;
  count: number;
}

export interface AmtBlockKpis {
  problems_attempted: number;
  problems_solved: number;
  total_attempts: number;
  solve_rate: number | null;
  avg_attempts_per_problem: number | null;
}

export interface AmtBlock {
  kpis: AmtBlockKpis;
  problems: AmtProblemDetail[];
  misconceptions: AmtMisconceptionStat[];
}

export interface AmtStudentReport {
  student: { user_id?: string; username?: string | null; name?: string | null };
  practice: AmtBlock;
  practicum: AmtBlock;
}

export interface AmtRemediationStatus {
  problem_key: string;
  tags: string[];
  completed: boolean;
  current_index: number;
}

export interface AmtStudentDetail extends AmtStudentReport {
  remediation: AmtRemediationStatus[];
}

export interface AmtTeacherKpis {
  students_active: number;
  students_enrolled: number;
  total_attempts: number;
  avg_attempts_per_student: number | null;
  solve_rate: number | null;
  remediation_started: number;
  remediation_completed: number;
}

export interface AmtProblemStat {
  task_ref: string;
  title: string | null;
  attempts: number;
  students_attempted: number;
  students_solved: number;
  solve_rate: number | null;
  top_misconception: string | null;
}

export interface AmtStudentRosterRow {
  user_id: string;
  name: string | null;
  username: string | null;
  matched: boolean;
  attempts: number;
  problems_solved: number;
  solve_rate: number | null;
  last_active: string | null;
}

export interface AmtTeacherSummary {
  scope: { course_id: number | null; context: string | null };
  kpis: AmtTeacherKpis;
  problems: AmtProblemStat[];
  misconceptions: AmtMisconceptionStat[];
  students: AmtStudentRosterRow[];
}

/** Context values on `attempts` that split the two student workspaces. */
export const CONTEXT_PRACTICE = 'practice';
export const CONTEXT_PRACTICUM = 'practicum';
