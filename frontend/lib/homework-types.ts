export type HomeworkPhaseStatus = 'red' | 'green' | 'yellow' | 'in_progress' | 'completed';

export interface HomeworkStatus {
  weekly_target_id: string;
  week: number;
  course_ref: string;
  topic_kc_focus: string;
  title: string;
  description?: string | null;
  starts_at?: string | null;
  deadline?: string | null;
  is_active: boolean;
  mp_status: HomeworkPhaseStatus;
  ps_status: HomeworkPhaseStatus;
  attempts_on_current?: number;
  max_attempts?: number;
  // Set once the student explicitly submits the whole set (then it's read-only).
  submitted_at?: string | null;
}

export interface MPQuestion {
  id: string;
  misconception_tag: string;
  text_en: string;
  text_id: string;
  code?: string | null;
  options_en: string[];
  options_id: string[];
  answer_index: number;
}

export interface MPSessionStatus {
  active: boolean;
  completed: boolean;
  weekly_target_id: string;
  tag_queue: string[];
  current_index: number;
  attempts_on_current: number;
  max_attempts: number;
  current_question?: MPQuestion | null;
}

export interface MPSubmitRequest {
  weekly_target_id: string;
  question_id: string;
  selected_option: string; // "A", "B", "C", "D"
  text_input?: string;
}

export interface MPSubmitResult {
  correct: boolean;
  status: 'correct' | 'incorrect';
  explanation_en: string;
  explanation_id: string;
  correct_answer_index: number;
  session_status: MPSessionStatus;
}

export interface StudentSummaryReport {
  user_id: string;
  username: string;
  mp_status: HomeworkPhaseStatus;
  mp_score?: number | null;
  ps_status: HomeworkPhaseStatus;
  ps_score?: number | null;
  completed: boolean;
  last_active_at?: string | null;
}

export interface ClassReport {
  weekly_target_id: string;
  week: number;
  topic_kc_focus: string;
  students: StudentSummaryReport[];
}

export interface MisconceptionCount {
  misconception_tag: string;
  triggered_count: number;
  total_attempts: number;
  student_count: number;
}

export interface HeatmapData {
  weekly_target_id: string;
  week: number;
  topic_kc_focus: string;
  misconceptions: MisconceptionCount[];
}

export interface StudentMPAttemptDetail {
  misconception_tag: string;
  question_text: string;
  selected_option: string;
  text_input?: string | null;
  status: 'correct' | 'incorrect';
  timestamp: string;
}

export interface StudentPSAttemptDetail {
  problem_key: string;
  problem_title: string;
  passed: boolean;
  submitted_at: string;
  code?: string | null;
  misconceptions_triggered: string[];
}

export interface StudentDrilldown {
  user_id: string;
  username: string;
  weekly_target_id: string;
  week: number;
  mp_attempts: StudentMPAttemptDetail[];
  ps_attempts: StudentPSAttemptDetail[];
}

export interface XlsxUploadResponse {
  status: 'success' | 'failed';
  details?: {
    participants: number;
    weekly_targets: number;
    misconception_questions: number;
    problem_misconceptions: number;
  };
  /** Non-fatal authoring problems (e.g. unknown misconception tags skipped) — P5/R1a. */
  warnings?: string[];
  error_message?: string;
}
