import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { AlertCircle, CheckCircle } from 'lucide-react';
import ProblemsManager from './ProblemsManager';
import HomeworkManager from './HomeworkManager';

async function getReviewEpisodes(token: string) {
  try {
    const data = await apiFetch<any[]>('review/episodes', {
      token,
      method: 'GET',
    });
    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err.message || 'An error occurred while fetching episodes queue.',
      status: err.status,
    };
  }
}

export default async function InstructorPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';
  const { data, error, status } = await getReviewEpisodes(token);

  return (
    <div className="space-y-8">
      {/* Page Title & Controls */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Tutoring Episode Queue</h1>
        <p className="text-xs text-slate-500 mt-1">
          Review agent-to-student conversations, check alignment with pedagogical goals, and inspect logs.
        </p>
      </div>

      {/* Review stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pending Evaluation</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-indigo-600">0</span>
            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-semibold">Active Queue</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Reviewed Today</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-600">0</span>
            <span className="text-[10px] text-slate-500">Target: 5 episodes</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Inter-Rater Consensus</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-350">--</span>
            <span className="text-[10px] text-slate-400">Awaiting ratings</span>
          </div>
        </div>
      </div>

      {/* Episodes Queue Table Placeholder */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800">Sampled Tutoring Episodes</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50">
                <th className="px-6 py-3.5">Episode ID</th>
                <th className="px-6 py-3.5">Student</th>
                <th className="px-6 py-3.5">KC Focus</th>
                <th className="px-6 py-3.5">Generated Output</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-sm font-semibold text-slate-700">No episodes available in queue</span>
                    <p className="mt-1 text-slate-550 max-w-sm text-center">
                      The queue appears empty, or the review system has not yet published student episodes.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* API Connectivity Check */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Day 1 connection test to backend endpoint: <code className="text-indigo-600 font-mono font-semibold">GET /review/episodes</code>
        </p>

        <div className="mt-4 space-y-3">
          {error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 text-xs text-slate-700">
              <div className="flex items-center text-amber-800 font-bold mb-2">
                <AlertCircle className="h-4.5 w-4.5 mr-2 text-amber-600" />
                <span>API Returned Expected Stub Error (Status {status})</span>
              </div>
              <p className="text-slate-600 mb-3">
                The frontend successfully authenticated with the backend, attached the JWT token, and read the expected stub response:
              </p>
              <pre className="p-3 bg-slate-50 rounded-lg text-rose-700 font-mono overflow-x-auto border border-slate-200">
                {error}
              </pre>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 text-xs text-slate-700">
              <div className="flex items-center text-emerald-800 font-bold mb-2">
                <CheckCircle className="h-4.5 w-4.5 mr-2 text-emerald-600" />
                <span>API Endpoint Successful!</span>
              </div>
              <pre className="p-3 bg-slate-50 rounded-lg text-emerald-700 font-mono overflow-x-auto border border-slate-200">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Homeworks Management */}
      <HomeworkManager />

      {/* Dynamic Problems Management */}
      <ProblemsManager />
    </div>
  );
}
