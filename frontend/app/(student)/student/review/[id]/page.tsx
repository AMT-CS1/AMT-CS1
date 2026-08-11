'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Award, Code2, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, BookOpen,
} from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import { Skeleton } from '@/components/Skeleton';

interface ReviewItem {
  problem_key: string;
  problem_title: string;
  solved: boolean;
  attempts_count: number;
  last_submitted_at: string | null;
  student_code: string | null;
  reference_code: string | null;
  misconceptions: any[];
}

interface ReviewResponse {
  target_id: string;
  kind: string;
  week: number;
  title: string | null;
  deadline: string | null;
  total_problems: number;
  solved_problems: number;
  problem_reviews: ReviewItem[];
}

const formatShortDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const formatTimeOnly = (d: Date): string =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function TargetReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/targets/review?target_id=${id}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Failed to load review (status ${res.status})`);
        if (!cancelled) setData(body);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load review');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const isLab = data?.kind === 'lab';
  const backPath = isLab ? '/student/practicum' : '/student';
  const backLabel = isLab ? 'Back to Checkpoints' : 'Back to Homework List';

  return (
    <div className="max-w-5xl mx-auto my-8 space-y-6">
      {/* Header Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900">
              {data ? (data.title || `${isLab ? 'Checkpoint' : 'Homework'} Week ${data.week}`) : 'Your Submission Review'}
            </h2>
            <p className="text-[11px] text-slate-500 max-w-md leading-relaxed">
              Review your submission for each problem: status, number of attempts, and your last answer.
              {data && data.deadline && new Date(data.deadline) > new Date()
                ? ' Reference solutions unlock after the deadline.'
                : ' Reference solutions are shown below where available.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {data ? (
            <div className="text-right space-y-0.5">
              <div className="text-3xl font-extrabold text-indigo-600 flex items-center gap-1.5">
                <Award className="h-6 w-6 text-indigo-400" />
                {data.solved_problems}<span className="text-slate-300">/</span>{data.total_problems}
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Solved</p>
            </div>
          ) : (
            <Skeleton className="h-10 w-20" />
          )}
          <div className="h-8 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => router.push(backPath)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2.5 text-[11px] font-bold text-slate-600 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{backLabel}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6 text-center space-y-2">
          <XCircle className="h-6 w-6 mx-auto text-rose-500" />
          <p className="text-sm font-bold text-rose-700">{error}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 hover:bg-rose-100 px-4 py-2 text-[11px] font-bold text-rose-600 transition-all cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Per-problem review cards */}
      {loading && !data ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-6 w-6 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-48" />
              </div>
              <Skeleton className="h-[250px] w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="space-y-6">
          {data.problem_reviews.map((review, idx) => {
            const lastSubTime = review.last_submitted_at ? new Date(review.last_submitted_at) : null;
            return (
              <div key={review.problem_key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                {/* Title bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-500">
                      {idx + 1}
                    </span>
                    <h3 className="text-sm font-extrabold text-slate-800">{review.problem_title}</h3>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${review.solved
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                      : 'bg-rose-50 border border-rose-100 text-rose-700'
                      }`}>
                      {review.solved
                        ? (<><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Solved</>)
                        : (<><XCircle className="h-3 w-3 text-rose-600" /> Unsolved</>)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-600">
                      <RefreshCw className="h-3 w-3" />
                      {review.attempts_count} {review.attempts_count === 1 ? 'attempt' : 'attempts'}
                    </span>
                  </div>
                  {lastSubTime ? (
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Last submission: {formatShortDate(lastSubTime)} at {formatTimeOnly(lastSubTime)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-semibold">No submissions made</span>
                  )}
                </div>

                {/* Code views */}
                <div className={`grid grid-cols-1 gap-5 ${review.reference_code ? 'lg:grid-cols-2' : ''}`}>
                  <div className="space-y-1.5 flex flex-col">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Code2 className="h-3.5 w-3.5" />
                      <span>Your Last Attempt</span>
                    </h4>
                    {review.student_code ? (
                      <div className="flex-1 min-h-[250px] relative rounded-xl overflow-hidden border border-slate-200">
                        <DapCodeEditor value={review.student_code} onChange={() => { }} readOnly={true} fillHeight={true} />
                      </div>
                    ) : (
                      <div className="flex-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 flex items-center justify-center text-center text-slate-400 text-xs font-semibold min-h-[250px]">
                        No code submitted for this problem
                      </div>
                    )}
                  </div>

                  {review.reference_code && (
                    <div className="space-y-1.5 flex flex-col">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Reference Solution</span>
                      </h4>
                      <div className="flex-1 min-h-[250px] relative rounded-xl overflow-hidden border border-slate-200">
                        <DapCodeEditor value={review.reference_code} onChange={() => { }} readOnly={true} fillHeight={true} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Misconceptions */}
                {review.misconceptions && review.misconceptions.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2 mt-4">
                    <div className="flex items-center gap-1.5 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Misconceptions Detected in Last Attempt</span>
                    </div>
                    <div className="space-y-2">
                      {review.misconceptions.map((m: any, mIdx: number) => (
                        <div key={mIdx} className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-1 text-xs">
                          <div className="font-bold text-slate-800">
                            {m.title} {m.code && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full">{m.code}</span>}
                          </div>
                          {m.description && <p className="text-slate-600 text-[10px] leading-relaxed">{m.description}</p>}
                          {m.buggy_expr && (
                            <pre className="p-2 bg-amber-50 border border-amber-100 rounded-md text-[9px] font-mono text-amber-900 overflow-x-auto whitespace-pre">
                              {m.buggy_expr}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {data.problem_reviews.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm font-semibold">
              No problems assigned to this {isLab ? 'checkpoint' : 'homework'} yet.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
