'use client';

import { useState, useEffect } from 'react';
import {
  AlertCircle, MessageSquareText, RefreshCw, Sparkles, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import { SkeletonFeedbackCards } from '@/components/Skeleton';

interface ReviewFeedbackItem {
  id: string;
  user_id: string;
  username: string;
  problem_key: string;
  problem_title?: string | null;
  question_text: string;
  student_answer: string;
  feedback_text: string;
  student_rating?: number | null;
  timestamp: string;
  expert_verdict?: boolean | null;
  verdict_timestamp?: string | null;
}

const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

function StudentRatingChip({ rating }: { rating?: number | null }) {
  if (rating === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
        <ThumbsUp className="h-3 w-3" /> Student: helpful
      </span>
    );
  }
  if (rating === -1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
        <ThumbsDown className="h-3 w-3" /> Student: not helpful
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
      Student: unrated
    </span>
  );
}

export default function FeedbackReview() {
  const [feedbacks, setFeedbacks] = useState<ReviewFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unjudged'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchFeedbacks = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/review/feedbacks');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load feedbacks.');
      }
      setFeedbacks(await res.json());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading feedbacks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const submitVerdict = async (feedbackId: string, helpful: boolean) => {
    const previous = feedbacks.find(f => f.id === feedbackId)?.expert_verdict ?? null;
    setSavingId(feedbackId);
    // Optimistic update; revert on failure
    setFeedbacks(prev => prev.map(f => f.id === feedbackId ? { ...f, expert_verdict: helpful } : f));
    try {
      const res = await fetch(`/api/review/feedbacks/${feedbackId}/verdict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ helpful }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save verdict.');
      }
    } catch (err: any) {
      console.error(err);
      setFeedbacks(prev => prev.map(f => f.id === feedbackId ? { ...f, expert_verdict: previous } : f));
      setError(err.message || 'An error occurred while saving the verdict.');
    } finally {
      setSavingId(null);
    }
  };

  const judgedCount = feedbacks.filter(f => f.expert_verdict !== null && f.expert_verdict !== undefined).length;
  const filtered = filter === 'unjudged'
    ? feedbacks.filter(f => f.expert_verdict === null || f.expert_verdict === undefined)
    : feedbacks;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3 text-[11px] text-red-800 flex items-start space-x-2.5">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Generated Feedback ({filtered.length})
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {judgedCount} of {feedbacks.length} judged by you · your verdict is independent of the student&apos;s own rating
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${filter === 'all'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
                  }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('unjudged')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${filter === 'unjudged'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-400 hover:text-slate-700'
                  }`}
              >
                Unjudged
              </button>
            </div>
            <button
              onClick={fetchFeedbacks}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonFeedbackCards cards={3} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquareText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs text-slate-400 font-medium">
              {feedbacks.length === 0
                ? 'No feedback has been generated for students yet.'
                : 'All feedback items have been judged. Nice work!'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((fb) => (
              <div key={fb.id} className="rounded-2xl border border-slate-150 bg-slate-50/30 p-4 space-y-3">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-slate-800">{fb.username}</span>
                    <span className="text-[11px] font-semibold text-slate-500 ml-2">
                      {fb.problem_title || fb.problem_key}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium ml-2">{formatTime(fb.timestamp)}</span>
                  </div>
                  <StudentRatingChip rating={fb.student_rating} />
                </div>

                {/* Question / Answer / Guidance */}
                <div className="space-y-2">
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Quiz Question</span>
                    <p className="text-[11px] text-slate-700 leading-relaxed mt-0.5 whitespace-pre-line">{fb.question_text}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Student&apos;s Answer</span>
                    <p className="text-[11px] font-mono text-slate-700 leading-relaxed mt-0.5">{fb.student_answer}</p>
                  </div>
                  <div className="rounded-lg border border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-purple-50/40 px-3 py-2">
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-indigo-700">
                      <Sparkles className="h-3 w-3" /> Tutor Guidance
                    </span>
                    <p className="text-[11px] text-slate-700 leading-relaxed mt-0.5 whitespace-pre-line font-medium">{fb.feedback_text}</p>
                  </div>
                </div>

                {/* Expert verdict */}
                <div className="pt-2 border-t border-slate-150 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Your expert verdict
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={savingId === fb.id}
                      onClick={() => submitVerdict(fb.id, true)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer ${fb.expert_verdict === true
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      <span>Helpful</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingId === fb.id}
                      onClick={() => submitVerdict(fb.id, false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer ${fb.expert_verdict === false
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-700'
                        }`}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      <span>Not helpful</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
