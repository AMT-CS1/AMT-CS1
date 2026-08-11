'use client';

import { useRef, useState } from 'react';
import {
  Settings, ShieldAlert, CheckCircle, AlertTriangle,
  Upload, Users, GraduationCap, KeyRound, Download, FileSpreadsheet, Loader2,
} from 'lucide-react';

interface RosterResult {
  id: string;
  filename: string;
  status: string;
  counts: Record<string, number>;
  generated_credentials: Record<string, string>;
  skipped: { username?: string; reason?: string }[];
  created_at: string;
}

export default function ResearcherPage() {
  const [courseRef, setCourseRef] = useState('CS1-Python');
  const [week, setWeek] = useState(3);
  const [topicKc, setTopicKc] = useState('While Loops & Indentation');
  const [targetTask, setTargetTask] = useState('Implement a summation script');
  const [source, setSource] = useState('curriculum_v1');
  
  const [loading, setLoading] = useState(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiError, setApiError] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<number | null>(null);

  // Roster provisioning upload
  const rosterInputRef = useRef<HTMLInputElement>(null);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null);
  const [rosterError, setRosterError] = useState<string>('');

  const handleRosterUpload = async () => {
    if (!rosterFile) return;
    setRosterLoading(true);
    setRosterResult(null);
    setRosterError('');
    try {
      const fd = new FormData();
      fd.append('file', rosterFile);
      const res = await fetch('/api/lms/roster', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload failed (status ${res.status})`);
      setRosterResult(data);
      setRosterFile(null);
      if (rosterInputRef.current) rosterInputRef.current.value = '';
    } catch (err: any) {
      setRosterError(err.message || 'Failed to upload roster');
    } finally {
      setRosterLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setApiResponse(null);
    setApiError('');
    setApiStatus(null);

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_ref: courseRef,
          week: Number(week),
          topic_kc_focus: topicKc,
          target_task: targetTask,
          source: source,
        }),
      });

      setApiStatus(res.status);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `API error: status ${res.status}`);
      }

      setApiResponse(data);
    } catch (err: any) {
      setApiError(err.message || 'Failed to submit target configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Introduction Card */}
      <div className="rounded-xl border border-slate-200 bg-slate-100/50 p-6">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-5 w-5 text-amber-600" />
          System Settings & Deployment Configuration
        </h1>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
          Define active targets, adjust hyper-parameters, and control prompt templates for the agentic tutoring nodes.
          Updating these values adjusts the curriculum guidelines loaded during student practice sessions.
        </p>
      </div>

      {/* Roster Provisioning Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="h-4.5 w-4.5 text-indigo-600" />
              Class Roster Provisioning
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-2xl">
              Upload a roster workbook to create student and teacher accounts, stand up the classroom,
              and link the teacher and students to it — in one step. The teacher&apos;s dashboard is scoped
              immediately after upload.
            </p>
          </div>
          <a
            href="/templates/roster_template.xlsx"
            download
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Template
          </a>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-[11px] text-slate-500 leading-relaxed">
          Expected sheets: <code className="text-indigo-600 font-mono font-semibold">COURSES</code>,{' '}
          <code className="text-indigo-600 font-mono font-semibold">TEACHERS</code>,{' '}
          <code className="text-indigo-600 font-mono font-semibold">STUDENTS</code>. Each person row needs{' '}
          <code className="font-mono">Course_ID</code>, <code className="font-mono">Username</code>,{' '}
          <code className="font-mono">Full_Name</code>, and <code className="font-mono">LMS_User_ID</code>.
          A <code className="font-mono">Password</code> column is optional — blanks get a generated temp password.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex-1 min-w-[220px]">
            <input
              ref={rosterInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setRosterFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-xs file:font-bold file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
          </label>
          <button
            type="button"
            onClick={handleRosterUpload}
            disabled={!rosterFile || rosterLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 transition-all"
          >
            {rosterLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            {rosterLoading ? 'Provisioning…' : 'Upload & Provision'}
          </button>
        </div>

        {rosterError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3.5 text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{rosterError}</span>
          </div>
        )}

        {rosterResult && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs mb-3">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                Provisioned from {rosterResult.filename}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { label: 'Courses', value: rosterResult.counts.courses ?? 0, icon: Settings },
                  { label: 'Teachers +', value: rosterResult.counts.teachers_created ?? 0, icon: GraduationCap },
                  { label: 'Students +', value: rosterResult.counts.students_created ?? 0, icon: Users },
                  { label: 'Teachers ~', value: rosterResult.counts.teachers_updated ?? 0, icon: GraduationCap },
                  { label: 'Students ~', value: rosterResult.counts.students_updated ?? 0, icon: Users },
                  { label: 'Skipped', value: rosterResult.counts.skipped ?? 0, icon: AlertTriangle },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      <s.icon className="h-3 w-3" /> {s.label}
                    </span>
                    <span className="block text-lg font-extrabold text-slate-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {Object.keys(rosterResult.generated_credentials).length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs mb-2">
                  <KeyRound className="h-4 w-4" />
                  Generated temporary passwords — shown once, distribute securely
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-amber-100 bg-white/70">
                  <table className="w-full text-[11px]">
                    <thead className="text-slate-400 uppercase tracking-wider">
                      <tr className="border-b border-amber-100">
                        <th className="text-left font-bold px-3 py-1.5">Username</th>
                        <th className="text-left font-bold px-3 py-1.5">Temp Password</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-slate-700">
                      {Object.entries(rosterResult.generated_credentials).map(([u, p]) => (
                        <tr key={u} className="border-b border-amber-50 last:border-0">
                          <td className="px-3 py-1.5">{u}</td>
                          <td className="px-3 py-1.5 font-bold text-amber-800">{p}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {rosterResult.skipped.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-4 text-xs text-slate-700">
                <div className="flex items-center gap-2 text-rose-700 font-bold mb-2">
                  <AlertTriangle className="h-4 w-4" /> Skipped rows ({rosterResult.skipped.length})
                </div>
                <ul className="space-y-1 list-disc list-inside text-[11px] text-slate-600">
                  {rosterResult.skipped.map((s, i) => (
                    <li key={i}><span className="font-mono font-semibold">{s.username || '(no username)'}</span> — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* MP question authoring template (P5/R1a) — uploaded via the instructor
            XLSX path; offered here so researchers can author the bank too. */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Authoring <span className="font-semibold text-slate-600">Misconception Problem (MP) questions</span>?
            The dedicated template includes per-option misconception-trigger columns; upload it through the
            instructor&apos;s XLSX workbook upload.
          </p>
          <a
            href="/templates/mp_template.xlsx"
            download
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 transition-all ml-3"
          >
            <Download className="h-3.5 w-3.5" />
            MP Template
          </a>
        </div>
      </div>

      {/* Configuration Form Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 mb-6">Weekly Targets Configuration</h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Course Reference</label>
              <input
                type="text"
                value={courseRef}
                onChange={(e) => setCourseRef(e.target.value)}
                required
                className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Week Number</label>
              <input
                type="number"
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                required
                className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Topic / Knowledge Component Focus</label>
            <input
              type="text"
              value={topicKc}
              onChange={(e) => setTopicKc(e.target.value)}
              required
              className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              placeholder="e.g. Nested structures, functions"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Target Task Prompt</label>
            <textarea
              value={targetTask}
              onChange={(e) => setTargetTask(e.target.value)}
              required
              rows={3}
              className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              placeholder="Describe the coding objective the student should complete..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Source Identifier</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
              className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/10 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
              {loading ? 'Submitting...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* API Integration Verification Results */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Day 1 connection test to backend endpoint: <code className="text-amber-600 font-mono font-semibold">POST /targets</code>
        </p>

        <div className="mt-4 space-y-3">
          {!apiResponse && !apiError && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-400">
              Awaiting configuration submission to trigger the backend API verification...
            </div>
          )}

          {apiError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 text-xs text-slate-700">
              <div className="flex items-start text-amber-800 font-bold mb-2">
                {apiStatus === 403 ? (
                  <>
                    <ShieldAlert className="h-4.5 w-4.5 mr-2 mt-0.5 flex-shrink-0 text-amber-650" />
                    <div>
                      <span>Expected Authorization Error (Status {apiStatus})</span>
                      <p className="mt-1 font-normal text-slate-600 text-[11px] leading-relaxed">
                        The backend requires the <code className="text-indigo-600 font-semibold font-mono">instructor</code> role to configure targets. 
                        Since you are logged in as a <code className="text-amber-650 font-semibold font-mono">researcher</code>, the backend correctly enforced its JWT guard and returned a 403:
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4.5 w-4.5 mr-2 mt-0.5 flex-shrink-0 text-amber-650" />
                    <span>Submission Error (Status {apiStatus})</span>
                  </>
                )}
              </div>
              <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-rose-700 font-mono overflow-x-auto border border-slate-200">
                {apiError}
              </pre>
            </div>
          )}

          {apiResponse && (
            <div className="rounded-lg border border-emerald-250 bg-emerald-50/30 p-4 text-xs text-slate-700">
              <div className="flex items-center text-emerald-800 font-bold mb-2">
                <CheckCircle className="h-4.5 w-4.5 mr-2 text-emerald-600" />
                <span>API Endpoint Successful!</span>
              </div>
              <pre className="p-3 bg-slate-50 rounded-lg text-emerald-700 font-mono overflow-x-auto border border-slate-200">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
