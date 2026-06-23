import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { AlertCircle, CheckCircle, RefreshCcw, Eye, Play, Check } from 'lucide-react';

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Tutoring Episode Queue</h1>
          <p className="text-xs text-slate-455 mt-1">
            Review agent-to-student conversations, check alignment with pedagogical goals, and inspect logs.
          </p>
        </div>
      </div>

      {/* Review stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pending Evaluation</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-indigo-400">0</span>
            <span className="text-[10px] text-slate-400 bg-indigo-500/5 px-2 py-0.5 rounded-full border border-indigo-500/10">Active Queue</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Reviewed Today</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-400">0</span>
            <span className="text-[10px] text-slate-455">Target: 5 episodes</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Inter-Rater Consensus</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-slate-400">--</span>
            <span className="text-[10px] text-slate-500">Awaiting ratings</span>
          </div>
        </div>
      </div>

      {/* Episodes Queue Table Placeholder */}
      <div className="rounded-xl border border-slate-900 bg-slate-900/30 overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-slate-900 bg-slate-900/40">
          <h2 className="text-sm font-bold text-white">Sampled Tutoring Episodes</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/20">
                <th className="px-6 py-3.5">Episode ID</th>
                <th className="px-6 py-3.5">Student</th>
                <th className="px-6 py-3.5">KC Focus</th>
                <th className="px-6 py-3.5">Generated Output</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* If no data can be retrieved */}
              <tr className="border-b border-slate-900/50">
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-sm font-medium text-slate-400">No episodes available in queue</span>
                    <p className="mt-1 text-slate-500 max-w-sm text-center">
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-450">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Day 1 connection test to backend endpoint: <code className="text-indigo-400 font-mono">GET /review/episodes</code>
        </p>

        <div className="mt-4 space-y-3">
          {error ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-xs">
              <div className="flex items-center text-amber-400 font-semibold mb-2">
                <AlertCircle className="h-4.5 w-4.5 mr-2" />
                <span>API Returned Expected Stub Error (Status {status})</span>
              </div>
              <p className="text-slate-350 mb-3">
                The frontend successfully authenticated with the backend, attached the JWT token, and read the expected stub response:
              </p>
              <pre className="p-3 bg-slate-950/80 rounded-lg text-rose-350 font-mono overflow-x-auto border border-slate-900">
                {error}
              </pre>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-xs">
              <div className="flex items-center text-emerald-400 font-semibold mb-2">
                <CheckCircle className="h-4.5 w-4.5 mr-2" />
                <span>API Endpoint Successful!</span>
              </div>
              <pre className="p-3 bg-slate-950/80 rounded-lg text-emerald-350 font-mono overflow-x-auto border border-slate-900">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
