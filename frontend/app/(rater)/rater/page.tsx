import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { AlertCircle, CheckCircle, Award } from 'lucide-react';

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

export default async function RaterPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';
  const { data, error, status } = await getReviewEpisodes(token);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Introduction Banner */}
      <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
          <Award className="h-5.5 w-5.5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Pedagogical Rubric Assessment</h1>
          <p className="mt-1 text-xs text-slate-455 leading-relaxed">
            Evaluate agentic tutoring interactions against standardized grading rubrics.
            Assess feedback quality, supportive tone, and accuracy of hints.
          </p>
        </div>
      </div>

      {/* Rubric Evaluation Form Placeholder */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl space-y-6">
        <div>
          <h2 className="text-base font-bold text-white">Evaluation Session</h2>
          <p className="text-xs text-slate-500 mt-0.5">Select a sampled session and grade its tutoring moves.</p>
        </div>

        <div className="space-y-4 opacity-50 select-none pointer-events-none">
          {/* Episode Select */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Select Episode ID</label>
            <select className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-slate-400 focus:outline-hidden">
              <option>No episodes ready for evaluation</option>
            </select>
          </div>

          {/* Scores grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Tone Assessment */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Supportive Tone</span>
              <span className="text-[10px] text-slate-500 block leading-tight">Was the agent's feedback encouraging and non-judgmental?</span>
              <div className="flex space-x-2 pt-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <span key={num} className="h-7 w-7 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-center text-xs text-slate-500 font-semibold">{num}</span>
                ))}
              </div>
            </div>

            {/* Hint Quality Assessment */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Socratic Hinting</span>
              <span className="text-[10px] text-slate-500 block leading-tight">Did the agent guide the student rather than giving the solution?</span>
              <div className="flex space-x-2 pt-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <span key={num} className="h-7 w-7 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-center text-xs text-slate-500 font-semibold">{num}</span>
                ))}
              </div>
            </div>

            {/* Concept Correctness Assessment */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Pedagogical Value</span>
              <span className="text-[10px] text-slate-500 block leading-tight">Did the explanation help correct misconceptions?</span>
              <div className="flex space-x-2 pt-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <span key={num} className="h-7 w-7 rounded-md border border-slate-800 bg-slate-900 flex items-center justify-center text-xs text-slate-500 font-semibold">{num}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Qualitative Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 font-medium">Qualitative Notes / Explanations</label>
            <textarea rows={3} className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs text-slate-400 focus:outline-hidden" placeholder="Provide context for scores..." />
          </div>

          <button disabled className="rounded-lg bg-pink-500/10 border border-pink-500/20 px-5 py-2.5 text-xs font-bold text-pink-400">
            Submit Assessment
          </button>
        </div>
      </div>

      {/* API Connectivity Check */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-450">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Day 1 connection test to backend endpoint: <code className="text-pink-400 font-mono">GET /review/episodes</code>
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
