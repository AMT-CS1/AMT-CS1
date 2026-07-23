// Shapes mirrored from backend/app/schemas/lms_reports.py

export interface LmsImport {
  id: string;
  filename: string;
  status: string;
  storage_ref?: string | null;
  row_counts?: Record<string, number> | null;
  unmatched_count: number;
  created_at: string;
}

export interface UnmatchedParticipant {
  course_id: number;
  lms_user_id: number;
  username?: string | null;
  email?: string | null;
  firstname?: string | null;
  lastname?: string | null;
}

export interface LmsImportResult extends LmsImport {
  unmatched_participants: UnmatchedParticipant[];
}

export interface LmsCourse {
  course_id: number;
  shortname: string | null;
  fullname: string | null;
  fakultas: string | null;
  prodi: string | null;
  tahun_ajar: string | null;
  student_count: number;
}

export interface TeacherKpis {
  students_attempted: number;
  students_enrolled: number;
  total_attempts: number;
  avg_attempts_per_student: number | null;
  avg_best_grade: number | null;
  correct_rate: number | null;
}

export interface QuizOverview {
  quiz_id: number;
  name: string | null;
  total_questions: number | null;
  students_attempted: number;
  avg_best_grade: number | null;
}

export interface QuestionStat {
  slot_number: number;
  question_name: string | null;
  students_attempted: number;
  students_correct: number;
  correct_rate: number | null;
  misconception_tags: string[] | null;
}

export interface MisconceptionStat {
  tag: string;
  name: string;
  wrong_count: number;
}

export interface StudentRosterRow {
  lms_user_id: number;
  name: string | null;
  username: string | null;
  matched: boolean;
  attempts: number;
  best_grade: number | null;
  correct_rate: number | null;
}

export interface TeacherSummary {
  scope: { course_id: number | null; quiz_id: number | null };
  kpis: TeacherKpis;
  quizzes: QuizOverview[];
  per_question: QuestionStat[];
  misconceptions: MisconceptionStat[];
  students: StudentRosterRow[];
}

export interface StudentKpis {
  quizzes_attempted: number;
  total_attempts: number;
  avg_attempts_per_quiz: number | null;
  correct_submissions: number;
  total_submissions: number;
  correct_rate: number | null;
}

export interface StudentQuestionDetail {
  slot_number: number;
  question_name: string | null;
  question_text: string | null;
  question_type: string | null;
  attempts: number;
  final_state: string | null;
  final_grade: number | null;
  student_answer: string | null;
  right_answer: string | null;
  misconception_tags: string[] | null;
}

export interface StudentQuizDetail {
  quiz_id: number;
  name: string | null;
  attempts_used: number;
  best_grade: number | null;
  last_grade: number | null;
  max_grade: number | null;
  correct_submissions: number;
  total_submissions: number;
  questions: StudentQuestionDetail[];
}

export interface StudentMisconception {
  tag: string;
  name: string;
  wrong_count: number;
  occurrences: { quiz_id: number; slot_number: number }[];
}

export interface StudentReport {
  student: {
    lms_user_id?: number | null;
    name?: string | null;
    username?: string | null;
    email?: string | null;
  };
  kpis: StudentKpis;
  quizzes: StudentQuizDetail[];
  misconceptions: StudentMisconception[];
}

export interface ResponseStepOut {
  slot_number: number;
  step: number;
  time: string | null;
  action: string | null;
  state: string | null;
  marks: number | null;
  coderunner_output: string | null;
}

export interface StepTimeline {
  quiz_id: number;
  lms_user_id: number;
  attempt_number: number;
  steps: ResponseStepOut[];
}

export interface QuestionSlotDetail {
  quiz_id: number;
  slot_number: number;
  question_id: number | null;
  name: string | null;
  type: string | null;
  text: string | null;
  misconception_tags: string[] | null;
}

/** Two-letter prefix of a Moodle state we render as "correct". */
export const CORRECT_STATE = 'gradedright';
export const WRONG_STATE = 'gradedwrong';
