'use client';

import { useState } from 'react';
import { Settings, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

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
