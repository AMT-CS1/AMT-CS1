'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Upload, RefreshCw, ArrowLeft, ChevronRight, Users, FileSpreadsheet,
  AlertTriangle, CheckCircle, XCircle, Activity, ClipboardList, Brain,
} from 'lucide-react';
import { Skeleton, SkeletonRows } from '@/components/Skeleton';
import { KpiCard, RateBar, StateBadge, MisconceptionPanel } from '@/components/reports/ui';
import { pct, num, dateTime } from '@/components/reports/formatters';
import type {
  TeacherSummary, LmsImport, LmsImportResult, StudentReport, StepTimeline, LmsCourse,
  StudentQuestionDetail,
} from '@/lib/lms-types';

// ---------- upload card ----------

function UploadCard({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<LmsImportResult | null>(null);
  const [error, setError] = useState('');

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/lms/imports', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setFile(null);
      onImported();
    } catch (e: any) {
      setError(e.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-600" />
        <h3 className="text-sm font-extrabold text-slate-800">Import LMS Export</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Upload a Moodle quiz report (<span className="font-mono">.xlsx</span>) to refresh the dashboard.
        Re-uploading a newer export updates the data in place.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-indigo-300 transition-colors">
          <Upload className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-600 truncate">
            {file ? file.name : 'Choose an .xlsx file…'}
          </span>
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setError(''); }}
          />
        </label>
        <button
          onClick={upload}
          disabled={!file || uploading}
          className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-all"
        >
          {uploading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <span>{uploading ? 'Importing…' : 'Import'}</span>
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-medium">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-emerald-150 bg-emerald-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs font-bold">Imported {result.filename}</span>
          </div>
          {result.row_counts && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.row_counts).map(([k, v]) => (
                <span key={k} className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                  {k.replace(/_/g, ' ')}: <span className="text-slate-900 font-bold">{v}</span>
                </span>
              ))}
            </div>
          )}
          {result.unmatched_participants?.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 text-amber-700 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold">
                  {result.unmatched_count} student{result.unmatched_count !== 1 ? 's' : ''} not linked to a local account
                </span>
              </div>
              <div className="max-h-32 overflow-auto rounded-lg border border-amber-150 bg-white divide-y divide-slate-100">
                {result.unmatched_participants.map((p) => (
                  <div key={p.lms_user_id} className="px-3 py-1.5 text-[11px] text-slate-600 flex justify-between">
                    <span className="font-semibold text-slate-700">
                      {[p.firstname, p.lastname].filter(Boolean).join(' ') || p.username}
                    </span>
                    <span className="text-slate-400 truncate ml-3">{p.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- response-step timeline (lazy) ----------

function AttemptSteps({ lmsUserId, quizId, attemptsUsed, questions }: {
  lmsUserId: number; quizId: number; attemptsUsed: number; questions: StudentQuestionDetail[];
}) {
  const [attempt, setAttempt] = useState<number>(attemptsUsed || 1);
  const [slot, setSlot] = useState<number | ''>('');
  const [data, setData] = useState<StepTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [openStep, setOpenStep] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setOpenStep(null);
    try {
      const params = new URLSearchParams({
        lms_user_id: String(lmsUserId), quiz_id: String(quizId), attempt_number: String(attempt),
      });
      if (slot !== '') params.set('slot_number', String(slot));
      const res = await fetch(`/api/lms/summary/steps?${params.toString()}`);
      const d = await res.json();
      setData(res.ok ? d : { quiz_id: quizId, lms_user_id: lmsUserId, attempt_number: attempt, steps: [] });
    } catch {
      setData({ quiz_id: quizId, lms_user_id: lmsUserId, attempt_number: attempt, steps: [] });
    } finally {
      setLoading(false);
    }
  };

  const selectedQuestion = slot === '' ? null : questions.find((q) => q.slot_number === slot) || null;

  return (
    <div className="mt-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response timeline</span>
        <select
          value={attempt}
          onChange={(e) => setAttempt(Number(e.target.value))}
          className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-700"
        >
          {Array.from({ length: Math.max(attemptsUsed, 1) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>Attempt {n}</option>
          ))}
        </select>
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value === '' ? '' : Number(e.target.value))}
          className="text-[11px] border border-slate-200 rounded-md px-1.5 py-0.5 bg-white text-slate-700 max-w-[220px]"
          title="Filter to one question"
        >
          <option value="">All questions</option>
          {questions.map((q) => (
            <option key={q.slot_number} value={q.slot_number}>
              Q{q.slot_number}{q.question_name ? ` · ${q.question_name.slice(0, 30)}` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
        >
          <Activity className="h-3 w-3" /> Load
        </button>
      </div>

      {/* question-slot detail (UC5) */}
      {selectedQuestion && (
        <div className="mb-3 rounded-lg border border-slate-150 bg-slate-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Question {selectedQuestion.slot_number}</span>
            {selectedQuestion.question_type && (
              <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{selectedQuestion.question_type}</span>
            )}
            {(selectedQuestion.misconception_tags || []).map((t) => (
              <span key={t} className="rounded-full border border-fuchsia-150 bg-fuchsia-50 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-700">{t}</span>
            ))}
          </div>
          {selectedQuestion.question_text && (
            <div className="text-[11px] bg-white border border-slate-150 rounded-lg p-2.5 whitespace-pre-wrap text-slate-700 max-h-48 overflow-auto">
              {selectedQuestion.question_text}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Student answer</div>
              <pre className="text-[10px] bg-white border border-slate-150 rounded-lg p-2 whitespace-pre-wrap text-slate-700 max-h-40 overflow-auto">{selectedQuestion.student_answer || '—'}</pre>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Right answer</div>
              <pre className="text-[10px] bg-emerald-50/40 border border-emerald-150 rounded-lg p-2 whitespace-pre-wrap text-slate-700 max-h-40 overflow-auto">{selectedQuestion.right_answer || '—'}</pre>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : data ? (
        data.steps.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No response steps recorded for attempt {data.attempt_number}.</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-150 divide-y divide-slate-100">
            {data.steps.map((s, i) => {
              const isOpen = openStep === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => setOpenStep(isOpen ? null : i)}
                    className="w-full px-3 py-1.5 flex items-center gap-3 text-[11px] hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <span className="font-mono text-slate-400 shrink-0">s{s.slot_number}·{s.step}</span>
                    <span className="font-semibold text-slate-700 flex-1 truncate" title={s.action || ''}>
                      {(s.action || '').split('\n')[0].slice(0, 48) || '—'}
                    </span>
                    <span className="text-slate-500 shrink-0">{s.state || ''}</span>
                    <span className="text-slate-400 shrink-0 tabular-nums">{s.marks != null ? `${s.marks} pts` : ''}</span>
                    <ChevronRight className={`h-3 w-3 text-slate-300 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2.5 pt-0.5 space-y-2 bg-slate-50/40">
                      {s.time && <div className="text-[10px] text-slate-400">{dateTime(s.time)}</div>}
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Action</div>
                        <pre className="text-[10px] bg-white border border-slate-150 rounded-lg p-2 whitespace-pre-wrap text-slate-700 max-h-48 overflow-auto">{s.action || '—'}</pre>
                      </div>
                      {s.coderunner_output && (
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">CodeRunner output</div>
                          <pre className="text-[10px] bg-slate-900 text-slate-100 rounded-lg p-2 whitespace-pre-wrap max-h-48 overflow-auto">{s.coderunner_output}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <p className="text-[11px] text-slate-400 italic">Pick an attempt and press Load.</p>
      )}
    </div>
  );
}

// ---------- student drill-down ----------

function StudentDetail({ lmsUserId, courseId, onBack }: { lmsUserId: number; courseId: number | null; onBack: () => void }) {
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openQuiz, setOpenQuiz] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = courseId ? `?course_id=${courseId}` : '';
        const res = await fetch(`/api/lms/summary/teacher/students/${lmsUserId}${qs}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load student');
        setReport(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [lmsUserId, courseId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
          title="Back to roster"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {report?.student?.name || `Student ${lmsUserId}`}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{report?.student?.email || report?.student?.username}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">{error}</div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Quizzes" value={String(report.kpis.quizzes_attempted)} icon={<ClipboardList className="h-4 w-4" />} />
            <KpiCard label="Avg attempts / quiz" value={num(report.kpis.avg_attempts_per_quiz)} icon={<RefreshCw className="h-4 w-4" />} />
            <KpiCard
              label="Correct submissions"
              value={`${report.kpis.correct_submissions}/${report.kpis.total_submissions}`}
              icon={<CheckCircle className="h-4 w-4" />}
            />
            <KpiCard label="Correct rate" value={pct(report.kpis.correct_rate)} icon={<Activity className="h-4 w-4" />} />
          </div>

          {report.misconceptions.length > 0 && (
            <MisconceptionPanel items={report.misconceptions} showTag />
          )}

          <div className="space-y-4">
            {report.quizzes.map((q) => {
              const open = openQuiz === q.quiz_id;
              return (
                <div key={q.quiz_id} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                  <button
                    onClick={() => setOpenQuiz(open ? null : q.quiz_id)}
                    className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{q.name || `Quiz ${q.quiz_id}`}</h3>
                      <p className="text-[11px] text-slate-450 mt-0.5">
                        {q.attempts_used} attempt{q.attempts_used !== 1 ? 's' : ''} · best {num(q.best_grade)}
                        {q.max_grade != null ? ` / ${num(q.max_grade)}` : ''} · {q.correct_submissions}/{q.total_submissions} correct
                      </p>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 p-4 space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-400 text-left">
                              <th className="font-semibold px-2 py-1">Slot</th>
                              <th className="font-semibold px-2 py-1">Question</th>
                              <th className="font-semibold px-2 py-1">Attempts</th>
                              <th className="font-semibold px-2 py-1">Final</th>
                              <th className="font-semibold px-2 py-1">Grade</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {q.questions.map((qq) => (
                              <tr key={qq.slot_number} className="text-slate-600">
                                <td className="px-2 py-1.5 font-mono text-slate-400">{qq.slot_number}</td>
                                <td className="px-2 py-1.5 max-w-[280px] truncate" title={qq.question_name || ''}>
                                  {qq.question_name || '—'}
                                </td>
                                <td className="px-2 py-1.5">{qq.attempts}</td>
                                <td className="px-2 py-1.5"><StateBadge state={qq.final_state} /></td>
                                <td className="px-2 py-1.5 tabular-nums">{num(qq.final_grade, 2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <AttemptSteps lmsUserId={lmsUserId} quizId={q.quiz_id} attemptsUsed={q.attempts_used} questions={q.questions} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------- main page ----------

export default function ReportsPage() {
  const [summary, setSummary] = useState<TeacherSummary | null>(null);
  const [imports, setImports] = useState<LmsImport[]>([]);
  const [courses, setCourses] = useState<LmsCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);

  const load = useCallback(async (courseId: number | null, quizId: number | null) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (courseId) params.set('course_id', String(courseId));
      if (quizId) params.set('quiz_id', String(quizId));
      const qs = params.toString();
      const [sumRes, impRes, crsRes] = await Promise.all([
        fetch(`/api/lms/summary/teacher${qs ? `?${qs}` : ''}`),
        fetch('/api/lms/imports'),
        fetch('/api/lms/courses'),
      ]);
      const sum = await sumRes.json();
      if (!sumRes.ok) throw new Error(sum.error || 'Failed to load summary');
      setSummary(sum);
      setImports(impRes.ok ? await impRes.json() : []);
      setCourses(crsRes.ok ? await crsRes.json() : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedCourse, selectedQuiz); }, [selectedCourse, selectedQuiz, load]);

  if (selectedStudent != null) {
    return (
      <StudentDetail
        lmsUserId={selectedStudent}
        courseId={summary?.scope?.course_id ?? null}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  const hasData = summary && (summary.kpis.students_enrolled > 0 || summary.quizzes.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">LMS Reports</h1>
        <p className="text-xs text-slate-500 mt-1">
          Cohort analytics from imported Moodle quiz exports. Select a quiz for the per-question breakdown, or a student to drill in.
        </p>
      </div>

      <UploadCard onImported={() => load(selectedCourse, selectedQuiz)} />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <SkeletonRows rows={6} />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">{error}</div>
      ) : !hasData ? (
        imports.length > 0 ? (
          // Data exists in the system, but this instructor isn't matched as a
          // teacher of any imported class (UC4 scoping) — a different state from
          // "nothing imported yet", and the one that used to read misleadingly.
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 py-12 px-6 text-center shadow-xs">
            <Users className="h-8 w-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-amber-800">You&rsquo;re not linked to any class yet</p>
            <p className="text-xs text-amber-700/80 mt-1.5 max-w-md mx-auto leading-relaxed">
              The import succeeded, but your account isn&rsquo;t matched as a teacher of any imported
              class, so there&rsquo;s nothing scoped to you. Your local username must match the
              teacher&rsquo;s Moodle username or email in the export — ask an admin to link your
              account, or import an export where you&rsquo;re listed as the class teacher.
            </p>
            <p className="text-[11px] text-amber-600/70 mt-3">
              Last import: {imports[0].filename} · {new Date(imports[0].created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-xs">
            <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">No LMS data yet</p>
            <p className="text-xs text-slate-400 mt-1">Import a Moodle quiz export above to see the dashboard.</p>
          </div>
        )
      ) : summary ? (
        <>
          {/* scope selectors */}
          <div className="flex flex-wrap items-center gap-4">
            {courses.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500">Class:</label>
                <select
                  value={selectedCourse ?? ''}
                  onChange={(e) => {
                    setSelectedCourse(e.target.value ? Number(e.target.value) : null);
                    setSelectedQuiz(null); // quizzes are course-specific
                  }}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-semibold max-w-[280px]"
                >
                  <option value="">All my classes ({courses.length})</option>
                  {courses.map((c) => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.shortname || c.fullname || `Course ${c.course_id}`}
                      {c.student_count ? ` · ${c.student_count} students` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500">Quiz:</label>
              <select
                value={selectedQuiz ?? ''}
                onChange={(e) => setSelectedQuiz(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-semibold"
              >
                <option value="">All quizzes ({summary.quizzes.length})</option>
                {summary.quizzes.map((q) => (
                  <option key={q.quiz_id} value={q.quiz_id}>{q.name || `Quiz ${q.quiz_id}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Participation"
              value={`${summary.kpis.students_attempted}/${summary.kpis.students_enrolled}`}
              sub="students attempted"
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard label="Avg attempts / student" value={num(summary.kpis.avg_attempts_per_student)} sub={`${summary.kpis.total_attempts} total`} icon={<RefreshCw className="h-4 w-4" />} />
            <KpiCard label="Avg best grade" value={num(summary.kpis.avg_best_grade, 2)} icon={<ClipboardList className="h-4 w-4" />} />
            <KpiCard label="Correct rate" value={pct(summary.kpis.correct_rate)} sub="students eventually correct" icon={<Activity className="h-4 w-4" />} />
          </div>

          {/* misconceptions */}
          {summary.misconceptions.length > 0 ? (
            <MisconceptionPanel items={summary.misconceptions} showTag />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-slate-400">
              <Brain className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              No misconception tags in this export yet — this panel populates once the question bank includes tags (e.g. VA-01).
            </div>
          )}

          {/* per-question (quiz selected) OR quiz overview */}
          {selectedQuiz != null ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">Per-question breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-100">
                      <th className="font-semibold px-4 py-2">Slot</th>
                      <th className="font-semibold px-4 py-2">Question</th>
                      <th className="font-semibold px-4 py-2">Attempted</th>
                      <th className="font-semibold px-4 py-2">Success rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.per_question.map((q) => (
                      <tr key={q.slot_number} className="text-slate-600 hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-slate-400">{q.slot_number}</td>
                        <td className="px-4 py-2 max-w-[360px] truncate" title={q.question_name || ''}>{q.question_name || '—'}</td>
                        <td className="px-4 py-2">{q.students_correct}/{q.students_attempted}</td>
                        <td className="px-4 py-2"><RateBar rate={q.correct_rate} /></td>
                      </tr>
                    ))}
                    {summary.per_question.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">No attempts for this quiz yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800">Quizzes ({summary.quizzes.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-100">
                      <th className="font-semibold px-4 py-2">Quiz</th>
                      <th className="font-semibold px-4 py-2">Questions</th>
                      <th className="font-semibold px-4 py-2">Students attempted</th>
                      <th className="font-semibold px-4 py-2">Avg best grade</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.quizzes.map((q) => (
                      <tr
                        key={q.quiz_id}
                        className="text-slate-600 hover:bg-indigo-50/40 cursor-pointer"
                        onClick={() => setSelectedQuiz(q.quiz_id)}
                      >
                        <td className="px-4 py-2 font-semibold text-slate-700 max-w-[320px] truncate">{q.name || `Quiz ${q.quiz_id}`}</td>
                        <td className="px-4 py-2">{q.total_questions ?? '—'}</td>
                        <td className="px-4 py-2">{q.students_attempted}</td>
                        <td className="px-4 py-2 tabular-nums">{num(q.avg_best_grade, 2)}</td>
                        <td className="px-4 py-2 text-right"><ChevronRight className="h-3.5 w-3.5 text-slate-300 inline" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* student roster */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Students ({summary.students.length})</h3>
              <span className="text-[10px] text-slate-400 font-semibold">click a row to drill in</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-100">
                    <th className="font-semibold px-4 py-2">Student</th>
                    <th className="font-semibold px-4 py-2">Linked</th>
                    <th className="font-semibold px-4 py-2">Attempts</th>
                    <th className="font-semibold px-4 py-2">Best grade</th>
                    <th className="font-semibold px-4 py-2">Correct rate</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.students.map((s) => (
                    <tr
                      key={s.lms_user_id}
                      className="text-slate-600 hover:bg-indigo-50/40 cursor-pointer"
                      onClick={() => setSelectedStudent(s.lms_user_id)}
                    >
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-700">{s.name || `Student ${s.lms_user_id}`}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[220px]">{s.username}</div>
                      </td>
                      <td className="px-4 py-2">
                        {s.matched
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                      </td>
                      <td className="px-4 py-2">{s.attempts}</td>
                      <td className="px-4 py-2 tabular-nums">{num(s.best_grade, 2)}</td>
                      <td className="px-4 py-2"><RateBar rate={s.correct_rate} /></td>
                      <td className="px-4 py-2 text-right"><ChevronRight className="h-3.5 w-3.5 text-slate-300 inline" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {imports.length > 0 && (
            <p className="text-[11px] text-slate-400">
              Last import: {imports[0].filename} · {new Date(imports[0].created_at).toLocaleString()}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
