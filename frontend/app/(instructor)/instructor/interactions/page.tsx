'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ChevronRight, Users, Activity, RefreshCw,
  CheckCircle, XCircle, HeartPulse, Cpu, BookOpen, FlaskConical, Inbox,
} from 'lucide-react';
import { Skeleton, SkeletonRows } from '@/components/Skeleton';
import { KpiCard, RateBar, MisconceptionPanel } from '@/components/reports/ui';
import { NativeBlock } from '@/components/reports/NativeBlock';
import { pct, num, dateTime } from '@/components/reports/formatters';
import type { LmsCourse } from '@/lib/lms-types';
import type { AmtTeacherSummary, AmtStudentDetail } from '@/lib/amt-types';

const CONTEXTS = [
  { key: '', label: 'All' },
  { key: 'practice', label: 'Practice Workspace' },
  { key: 'practicum', label: 'Practicum Session' },
];

// ---------- student drill-down ----------

function StudentDetail({ userId, courseId, onBack }: { userId: string; courseId: number | null; onBack: () => void }) {
  const [report, setReport] = useState<AmtStudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const qs = courseId ? `?course_id=${courseId}` : '';
        const res = await fetch(`/api/amt/summary/teacher/students/${userId}${qs}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to load student');
        setReport(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, courseId]);

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
            {report?.student?.name || report?.student?.username || 'Student'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{report?.student?.username}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">{error}</div>
      ) : report ? (
        <>
          {report.remediation.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <HeartPulse className="h-4.5 w-4.5 text-rose-500" />
                <h3 className="text-sm font-extrabold text-slate-800">Remediation</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {report.remediation.map((r) => (
                  <span
                    key={r.problem_key}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      r.completed
                        ? 'border-emerald-150 bg-emerald-50 text-emerald-700'
                        : 'border-amber-150 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {r.problem_key}
                    <span className="text-slate-400 font-mono">{r.tags.join(',')}</span>
                    {r.completed ? 'done' : `step ${r.current_index + 1}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-teal-600" />
              <h2 className="text-sm font-extrabold text-slate-800">Practice Workspace</h2>
            </div>
            <NativeBlock block={report.practice} emptyLabel="No Practice Workspace activity." />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-extrabold text-slate-800">Practicum Session</h2>
            </div>
            <NativeBlock block={report.practicum} emptyLabel="No Practicum Session activity." />
          </section>
        </>
      ) : null}
    </div>
  );
}

// ---------- main page ----------

export default function InteractionsPage() {
  const [summary, setSummary] = useState<AmtTeacherSummary | null>(null);
  const [courses, setCourses] = useState<LmsCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<number | null>(null);
  const [context, setContext] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const load = useCallback(async (courseId: number | null, ctx: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (courseId) params.set('course_id', String(courseId));
      if (ctx) params.set('context', ctx);
      const qs = params.toString();
      const [sumRes, crsRes] = await Promise.all([
        fetch(`/api/amt/summary/teacher${qs ? `?${qs}` : ''}`),
        fetch('/api/lms/courses'),
      ]);
      const sum = await sumRes.json();
      if (!sumRes.ok) throw new Error(sum.error || 'Failed to load interactions');
      setSummary(sum);
      setCourses(crsRes.ok ? await crsRes.json() : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedCourse, context); }, [selectedCourse, context, load]);

  if (selectedStudent != null) {
    return (
      <StudentDetail
        userId={selectedStudent}
        courseId={selectedCourse}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  const hasData = summary && (summary.kpis.students_enrolled > 0 || summary.kpis.total_attempts > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">AMT-CS1 Interactions</h1>
        <p className="text-xs text-slate-500 mt-1">
          In-tutor activity from the Practice Workspace and Practicum Sessions. Pick a class and workspace, or a student to drill in.
        </p>
      </div>

      {/* scope selectors */}
      <div className="flex flex-wrap items-center gap-4">
        {courses.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">Class:</label>
            <select
              value={selectedCourse ?? ''}
              onChange={(e) => setSelectedCourse(e.target.value ? Number(e.target.value) : null)}
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
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          {CONTEXTS.map((c) => (
            <button
              key={c.key}
              onClick={() => setContext(c.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                context === c.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

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
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-xs">
          <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No interaction data yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Students&apos; Practice Workspace and Practicum submissions will appear here.
            {courses.length === 0 && ' Import an LMS export to group activity by class.'}
          </p>
        </div>
      ) : summary ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Participation"
              value={`${summary.kpis.students_active}/${summary.kpis.students_enrolled}`}
              sub="students active"
              icon={<Users className="h-4 w-4" />}
            />
            <KpiCard label="Avg attempts / student" value={num(summary.kpis.avg_attempts_per_student)} sub={`${summary.kpis.total_attempts} total`} icon={<RefreshCw className="h-4 w-4" />} />
            <KpiCard label="Solve rate" value={pct(summary.kpis.solve_rate)} sub="problems solved" icon={<Activity className="h-4 w-4" />} />
            <KpiCard
              label="Remediation done"
              value={`${summary.kpis.remediation_completed}/${summary.kpis.remediation_started}`}
              icon={<HeartPulse className="h-4 w-4" />}
            />
          </div>

          {/* misconceptions */}
          {summary.misconceptions.length > 0 ? (
            <MisconceptionPanel items={summary.misconceptions} showTag />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4 text-xs text-slate-400">
              <Cpu className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              No misconceptions detected in this scope yet.
            </div>
          )}

          {/* per-problem table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800">Problems ({summary.problems.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-100">
                    <th className="font-semibold px-4 py-2">Problem</th>
                    <th className="font-semibold px-4 py-2">Attempts</th>
                    <th className="font-semibold px-4 py-2">Solved</th>
                    <th className="font-semibold px-4 py-2">Solve rate</th>
                    <th className="font-semibold px-4 py-2">Top misconception</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.problems.map((p) => (
                    <tr key={p.task_ref} className="text-slate-600 hover:bg-slate-50/50">
                      <td className="px-4 py-2 font-semibold text-slate-700 max-w-[280px] truncate" title={p.title || p.task_ref}>
                        {p.title || p.task_ref}
                      </td>
                      <td className="px-4 py-2">{p.attempts}</td>
                      <td className="px-4 py-2">{p.students_solved}/{p.students_attempted}</td>
                      <td className="px-4 py-2"><RateBar rate={p.solve_rate} /></td>
                      <td className="px-4 py-2">
                        {p.top_misconception
                          ? <span className="rounded-full border border-fuchsia-150 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700">{p.top_misconception}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  {summary.problems.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400 italic">No problems attempted in this scope yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
                    <th className="font-semibold px-4 py-2">Solved</th>
                    <th className="font-semibold px-4 py-2">Solve rate</th>
                    <th className="font-semibold px-4 py-2">Last active</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.students.map((s) => (
                    <tr
                      key={s.user_id}
                      className="text-slate-600 hover:bg-indigo-50/40 cursor-pointer"
                      onClick={() => setSelectedStudent(s.user_id)}
                    >
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-700">{s.name || s.username || 'Student'}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[220px]">{s.username}</div>
                      </td>
                      <td className="px-4 py-2">
                        {s.matched
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                      </td>
                      <td className="px-4 py-2">{s.attempts}</td>
                      <td className="px-4 py-2">{s.problems_solved}</td>
                      <td className="px-4 py-2"><RateBar rate={s.solve_rate} /></td>
                      <td className="px-4 py-2 text-slate-400">{dateTime(s.last_active)}</td>
                      <td className="px-4 py-2 text-right"><ChevronRight className="h-3.5 w-3.5 text-slate-300 inline" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
