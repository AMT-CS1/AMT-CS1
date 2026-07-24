'use client';

import React, { useState, useEffect } from 'react';
import {
  History, ClipboardList, RefreshCw, CheckCircle, Activity, ChevronRight,
  LinkIcon, AlertCircle, BookOpen, FlaskConical,
} from 'lucide-react';
import { Skeleton, SkeletonRows } from '@/components/Skeleton';
import { KpiCard, StateBadge, MisconceptionPanel, Tabs } from '@/components/reports/ui';
import { NativeBlock } from '@/components/reports/NativeBlock';
import { pct, num } from '@/components/reports/formatters';
import type { StudentReport } from '@/lib/lms-types';
import type { AmtStudentReport } from '@/lib/amt-types';

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

// ---------- Native history (Homework / Checkpoint) ----------

function NativeHistory({ context }: { context: 'practice' | 'practicum' }) {
  const [report, setReport] = useState<AmtStudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/amt/summary/student');
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load your activity');
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
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }
  if (!report) return null;

  const block = context === 'practice' ? report.practice : report.practicum;
  const label = context === 'practice' ? 'Homework' : 'Checkpoint';
  return <NativeBlock block={block} emptyLabel={`No ${label} activity yet.`} />;
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
