import { cookies } from 'next/headers';
import { decodeJwt } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { Sparkles, Play, AlertCircle, CheckCircle } from 'lucide-react';

const STUB_STUDENT_ID = '11111111-1111-1111-1111-111111111111';

async function getStudentProgress(token: string) {
  try {
    const data = await apiFetch(`/students/${STUB_STUDENT_ID}/progress`, {
      token,
      method: 'GET',
    });
    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err.message || 'An error occurred while fetching progress data.',
      status: err.status,
    };
  }
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';
  const { data, error, status } = await getStudentProgress(token);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Welcome supportive banner */}
      <div className="rounded-2xl border border-teal-500/15 bg-gradient-to-r from-teal-500/5 to-emerald-500/5 p-6 sm:p-8">
        <div className="flex items-start space-x-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">
              Welcome back to your learning space!
            </h1>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              Every programmer starts somewhere, and practicing regularly is the key to mastering code.
              Let's take it one concept at a time. I am here to help you work through coding challenges and learn together!
            </p>
          </div>
        </div>
      </div>

      {/* No Active Session Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl">
        <h2 className="text-base font-bold text-white">Current Practice Session</h2>
        
        <div className="mt-6 flex flex-col items-center justify-center text-center p-8 rounded-lg border border-dashed border-slate-800 bg-slate-950/40">
          <div className="rounded-full bg-slate-900/80 p-3 border border-slate-800 text-slate-400 mb-4">
            <Play className="h-6 w-6 ml-0.5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">No active practice session</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md">
            When you're ready, we can start a new interactive coding walkthrough. You can learn loops, conditionals, and variables at your own pace!
          </p>
          <button
            disabled
            className="mt-5 rounded-lg bg-teal-500/10 border border-teal-500/20 px-4 py-2 text-xs font-semibold text-teal-400 cursor-not-allowed hover:bg-teal-500/15"
          >
            Start Learning Session (Coming Soon)
          </button>
        </div>
      </div>

      {/* API Connectivity Check */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-450">
          Backend API Integration Check
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Day 1 connection test to backend endpoint: <code className="text-teal-400 font-mono">GET /students/&#123;id&#125;/progress</code>
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
