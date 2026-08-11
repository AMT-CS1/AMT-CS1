'use client';

import React, { useState, useEffect } from 'react';
import {
  History, ClipboardList, RefreshCw, CheckCircle, Activity, ChevronRight,
  LinkIcon, AlertCircle, BookOpen, FlaskConical,
} from 'lucide-react';
import { Skeleton, SkeletonRows } from '@/components/Skeleton';
import { KpiCard, StateBadge, MisconceptionPanel, RecommendationCard, Tabs } from '@/components/reports/ui';
import type { RecommendationItem } from '@/components/reports/ui';
import { pct, num, dateTime } from '@/components/reports/formatters';
import type { StudentReport } from '@/lib/lms-types';

// ---------- LMS history (imported Moodle quiz data) ----------

function LmsHistory() {
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState('');
  const [openQuiz, setOpenQuiz] = useState<number | null>(null);
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/lms/summary/student');
        if (res.status === 404) { setNotLinked(true); return; }
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load your history');
        setReport(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <SkeletonRows rows={5} />
      </div>
    );
  }
  if (notLinked) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-14 px-6 text-center shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 border border-teal-100 text-teal-600 mb-4">
          <LinkIcon className="h-5 w-5" />
        </div>
        <p className="text-sm font-bold text-slate-700">Your LMS account isn&apos;t linked yet</p>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
          Once your instructor imports the latest quiz export and your account is matched, your quiz
          history and progress will appear here.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Quizzes attempted" value={String(report.kpis.quizzes_attempted)} accentClass="text-teal-500/70" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiCard label="Avg attempts / quiz" value={num(report.kpis.avg_attempts_per_quiz)} sub={`${report.kpis.total_attempts} total`} accentClass="text-teal-500/70" icon={<RefreshCw className="h-4 w-4" />} />
        <KpiCard label="Correct submissions" value={`${report.kpis.correct_submissions}/${report.kpis.total_submissions}`} accentClass="text-teal-500/70" icon={<CheckCircle className="h-4 w-4" />} />
        <KpiCard label="Correct rate" value={pct(report.kpis.correct_rate)} accentClass="text-teal-500/70" icon={<Activity className="h-4 w-4" />} />
      </div>

      {report.misconceptions.length > 0 && (
        <MisconceptionPanel
          items={report.misconceptions}
          title="Concepts to review"
          subtitle="Based on your quiz answers, these topics came up as areas to revisit."
        />
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Quizzes ({report.quizzes.length})</h3>
        {report.quizzes.map((q) => {
          const open = openQuiz === q.quiz_id;
          return (
            <div key={q.quiz_id} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <button
                onClick={() => { setOpenQuiz(open ? null : q.quiz_id); setOpenSlot(null); }}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{q.name || `Quiz ${q.quiz_id}`}</h4>
                  <p className="text-[11px] text-slate-450 mt-0.5">
                    {q.attempts_used} attempt{q.attempts_used !== 1 ? 's' : ''} · best {num(q.best_grade)}
                    {q.max_grade != null ? ` / ${num(q.max_grade)}` : ''} · {q.correct_submissions}/{q.total_submissions} correct
                  </p>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>

              {open && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {q.questions.map((qq) => {
                    const slotKey = `${q.quiz_id}-${qq.slot_number}`;
                    const slotOpen = openSlot === slotKey;
                    return (
                      <div key={qq.slot_number}>
                        <button
                          onClick={() => setOpenSlot(slotOpen ? null : slotKey)}
                          className="w-full px-5 py-2.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors text-left"
                        >
                          <span className="font-mono text-[11px] text-slate-400 w-6 shrink-0">#{qq.slot_number}</span>
                          <span className="text-xs text-slate-600 flex-1 truncate" title={qq.question_name || ''}>
                            {qq.question_name || 'Question'}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {qq.attempts} try{qq.attempts !== 1 ? 's' : ''}
                          </span>
                          <StateBadge state={qq.final_state} />
                          <ChevronRight className={`h-3.5 w-3.5 text-slate-300 shrink-0 transition-transform ${slotOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {slotOpen && (
                          <div className="px-5 pb-4 pt-1 space-y-3">
                            {/* UC6: the actual question, not just the answers */}
                            {(qq.question_text || qq.question_type) && (
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Question</span>
                                  {qq.question_type && (
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                                      {qq.question_type}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] bg-white border border-slate-150 rounded-lg p-3 whitespace-pre-wrap text-slate-700 max-h-64 overflow-auto">
                                  {qq.question_text || qq.question_name || '—'}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Your answer</div>
                                <pre className="text-[11px] bg-slate-50 border border-slate-150 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-56">
                                  {qq.student_answer || '—'}
                                </pre>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Reference answer</div>
                                <pre className="text-[11px] bg-emerald-50/40 border border-emerald-150 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-slate-700 max-h-56">
                                  {qq.right_answer || '—'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Native history (per-homework, MP + PS split) ----------

interface MpAttempt {
  misconception_tag: string;
  question_text_en: string | null;
  question_text_id: string | null;
  selected_option: string;
  text_input: string | null;
  status: string;
  timestamp: string;
}
interface PsAttempt {
  id: string;
  timestamp: string;
  passed: boolean;
  misconception_tags: string[];
  pseudocode_explanation: string | null;
}
interface PsProblem {
  task_ref: string;
  title: string | null;
  solved: boolean;
  first_solved_at: string | null;
  attempts: PsAttempt[];
}
/** One concept's fused MP + PS evidence (P5/R3). */
interface MisconceptionProfileItem {
  tag: string;
  name: string;
  count: number;
  mp_count: number;
  ps_count: number;
  codes: string[];
  first_seen: string | null;
  last_seen: string | null;
}
interface HwEntry {
  weekly_target_id: string;
  week: number;
  title: string | null;
  kind: string;
  context: string;
  submitted_at: string | null;
  mp: { attempts: MpAttempt[]; total: number; correct: number };
  ps: { problems: PsProblem[]; attempted: number; solved: number };
  misconception_profile?: MisconceptionProfileItem[];
  recommendations?: RecommendationItem[];
}
interface HwHistory {
  homeworks: HwEntry[];
  checkpoints: HwEntry[];
  /** Overall across all homework entries (P5/R3). */
  misconception_profile?: MisconceptionProfileItem[];
  recommendations?: RecommendationItem[];
}

function CodeView({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (code == null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/attempts/${attemptId}/code`);
        const d = await res.json();
        setCode(res.ok ? (d.code ?? d.content ?? '—') : (d.error || 'Failed to load code'));
      } catch { setCode('Failed to load code'); }
      finally { setLoading(false); }
    }
  };
  return (
    <div>
      <button onClick={load} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
        {open ? 'Hide code' : 'View code'}
      </button>
      {open && (
        <pre className="mt-1 text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-56">
          {loading ? 'Loading…' : code}
        </pre>
      )}
    </div>
  );
}

function NativeHistory({ context }: { context: 'practice' | 'practicum' }) {
  const [data, setData] = useState<HwHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'id'>('en');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/amt/summary/student/homework');
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load your activity');
        setData(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SkeletonRows rows={5} />;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }

  const entries = (context === 'practice' ? data?.homeworks : data?.checkpoints) || [];
  const label = context === 'practice' ? 'Homework' : 'Checkpoint';
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 px-6 text-center text-xs text-slate-500 shadow-xs">
        No {label} activity yet.
      </div>
    );
  }

  const optionText = (o: string) => (o === 'D' ? 'D (Tidak Tahu)' : o);

  const overallProfile = data?.misconception_profile || [];
  const overallRecs = data?.recommendations || [];

  return (
    <div className="space-y-4">
      {/* P5/R3: overall misconception profile + study recommendations (homework only). */}
      {context === 'practice' && (overallProfile.length > 0 || overallRecs.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MisconceptionPanel
            items={overallProfile}
            title="Your misconception profile"
            subtitle="Concepts your quiz answers (MP) and code submissions (PS) keep flagging, across all homework weeks."
            showTag
          />
          <RecommendationCard
            items={overallRecs}
            subtitle="Ranked by how often each concept was flagged. Quiz = MP answers, Code = detected in your submissions."
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{label} history ({entries.length})</h3>
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
          {(['en', 'id'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${lang === l ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {entries.map((e) => {
        const open = openEntry === e.weekly_target_id;
        return (
          <div key={e.weekly_target_id} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <button
              onClick={() => setOpenEntry(open ? null : e.weekly_target_id)}
              className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left"
            >
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {label} {e.week}{e.title ? ` · ${e.title}` : ''}
                </h4>
                <p className="text-[11px] text-slate-450 mt-0.5">
                  MP {e.mp.correct}/{e.mp.total} correct · PS {e.ps.solved}/{e.ps.attempted} solved
                  {e.submitted_at ? ` · submitted ${dateTime(e.submitted_at)}` : ''}
                </p>
              </div>
              <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>

            {open && (
              <div className="border-t border-slate-100 p-5 space-y-5">
                {/* This week's misconception profile (P5/R3) — localizes the pattern. */}
                {context === 'practice' && (e.misconception_profile?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 mb-2">This week's misconceptions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.misconception_profile!.map((m) => (
                        <span key={m.tag} className="inline-flex items-center gap-1 rounded-full border border-fuchsia-150 bg-white px-2 py-0.5 text-[10px] font-bold text-fuchsia-800">
                          {m.name}
                          <span className="text-fuchsia-400">({m.tag})</span>
                          <span className="text-fuchsia-600">×{m.count}</span>
                          <span className="text-[9px] font-semibold text-slate-400">
                            {m.mp_count > 0 && m.ps_count > 0 ? 'quiz+code' : m.mp_count > 0 ? 'quiz' : 'code'}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* MP section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Misconception Problems (MP)</span>
                    <span className="text-[10px] text-slate-400">{e.mp.correct}/{e.mp.total} correct</span>
                  </div>
                  {e.mp.attempts.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No MP answers recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {e.mp.attempts.map((m, i) => (
                        <div key={i} className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{m.misconception_tag}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.status === 'correct' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {m.status}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-auto">{dateTime(m.timestamp)}</span>
                          </div>
                          <p className="text-[12px] text-slate-700">{(lang === 'id' ? m.question_text_id : m.question_text_en) || '—'}</p>
                          <p className="text-[11px] text-slate-500">
                            Your choice: <b>{optionText(m.selected_option)}</b>
                            {m.text_input ? <> — <span className="italic">“{m.text_input}”</span></> : null}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* PS section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Problem Solving (PS)</span>
                    <span className="text-[10px] text-slate-400">{e.ps.solved}/{e.ps.attempted} solved</span>
                  </div>
                  {e.ps.problems.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No PS submissions recorded.</p>
                  ) : (
                    <div className="space-y-3">
                      {e.ps.problems.map((p) => (
                        <div key={p.task_ref} className="rounded-lg border border-slate-150 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">{p.title || p.task_ref}</span>
                            <StateBadge state={p.solved ? 'passed' : 'failed'} />
                            <span className="text-[10px] text-slate-400 ml-auto">{p.attempts.length} attempt{p.attempts.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="space-y-2">
                            {p.attempts.map((a) => (
                              <div key={a.id} className="rounded-md bg-slate-50/60 border border-slate-100 p-2.5 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {a.passed ? 'passed' : 'failed'}
                                  </span>
                                  {a.misconception_tags.map((t) => (
                                    <span key={t} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{t}</span>
                                  ))}
                                  <span className="text-[10px] text-slate-400 ml-auto">{dateTime(a.timestamp)}</span>
                                </div>
                                {a.pseudocode_explanation && (
                                  <p className="text-[11px] text-slate-600">
                                    <span className="font-bold text-slate-400">Jelasin Pseudocode: </span>
                                    <span className="italic">{a.pseudocode_explanation}</span>
                                  </p>
                                )}
                                <CodeView attemptId={a.id} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- page ----------

const TABS = [
  { key: 'lms', label: 'LMS', icon: <History className="h-4 w-4" /> },
  { key: 'practice', label: 'Homework', icon: <BookOpen className="h-4 w-4" /> },
  { key: 'practicum', label: 'Checkpoint', icon: <FlaskConical className="h-4 w-4" /> },
];

export default function HistoryPage() {
  const [tab, setTab] = useState('lms');

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/25 text-teal-600">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">My History</h1>
          <p className="text-xs text-slate-500 mt-0.5">Your quiz activity from the LMS and your work in the AMT-CS1 tutor.</p>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'lms' && <LmsHistory />}
      {tab === 'practice' && <NativeHistory context="practice" />}
      {tab === 'practicum' && <NativeHistory context="practicum" />}
    </div>
  );
}
