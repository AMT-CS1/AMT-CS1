'use client';

import { useState } from 'react';
import { Settings, Play, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

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
      <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-amber-400" />
          System Settings & Deployment Configuration
        </h1>
        <p className="mt-2 text-xs text-slate-455 leading-relaxed">
          Define active targets, adjust hyper-parameters, and control prompt templates for the agentic tutoring nodes.
          Updating these values adjusts the curriculum guidelines loaded during student practice sessions.
        </p>
      </div>

      {/* Configuration Form Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
        <h2 className="text-base font-bold text-white mb-6">Weekly Targets Configuration</h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Course Reference</label>
              <input
                type="text"
                value={courseRef}
                onChange={(e) => setCourseRef(e.target.value)}
                required
                className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Week Number</label>
              <input
                type="number"
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                required
                className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Topic / Knowledge Component Focus</label>
            <input
              type="text"
              value={topicKc}
              onChange={(e) => setTopicKc(e.target.value)}
              required
              className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              placeholder="e.g. Nested structures, functions"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Target Task Prompt</label>
            <textarea
              value={targetTask}
              onChange={(e) => setTargetTask(e.target.value)}
              required
              rows={3}
              className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              placeholder="Describe the coding objective the student should complete..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Source Identifier</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
              className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/10 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
            >
              {loading ? 'Submitting...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* API Integration Verification Results */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-450">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Day 1 connection test to backend endpoint: <code className="text-amber-400 font-mono">POST /targets</code>
        </p>

        <div className="mt-4 space-y-3">
          {!apiResponse && !apiError && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">
              Awaiting configuration submission to trigger the backend API verification...
            </div>
          )}

          {apiError && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-xs">
              <div className="flex items-start text-amber-400 font-semibold mb-2">
                {apiStatus === 403 ? (
                  <>
                    <ShieldAlert className="h-4.5 w-4.5 mr-2 mt-0.5 flex-shrink-0" />
                    <div>
                      <span>Expected Authorization Error (Status {apiStatus})</span>
                      <p className="mt-1 font-normal text-slate-400 text-[11px] leading-relaxed">
                        The backend requires the <code className="text-indigo-400 font-semibold">instructor</code> role to configure targets. 
                        Since you are logged in as a <code className="text-amber-400 font-semibold">researcher</code>, the backend correctly enforced its JWT guard and returned a 403:
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4.5 w-4.5 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Submission Error (Status {apiStatus})</span>
                  </>
                )}
              </div>
              <pre className="mt-2 p-3 bg-slate-950/80 rounded-lg text-rose-350 font-mono overflow-x-auto border border-slate-900">
                {apiError}
              </pre>
            </div>
          )}

          {apiResponse && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs">
              <div className="flex items-center text-emerald-400 font-semibold mb-2">
                <CheckCircle className="h-4.5 w-4.5 mr-2" />
                <span>API Endpoint Successful!</span>
              </div>
              <pre className="p-3 bg-slate-950/80 rounded-lg text-emerald-350 font-mono overflow-x-auto border border-slate-900">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
