'use client';

import { useState, useEffect } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight,
  Code2, FileSearch, RefreshCw, XCircle,
} from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import { Skeleton, SkeletonRows, SkeletonText } from '@/components/Skeleton';
import AstPanel from './AstPanel';

interface Misconception {
  code: string;
  title: string;
  description: string;
  detail: string;
  buggy_expr: string;
}

interface ReviewAttemptSummary {
  id: string;
  user_id: string;
  username: string;
  task_ref: string;
  problem_title?: string | null;
  passed?: boolean | null;
  timestamp: string;
  has_ast: boolean;
  misconceptions: Misconception[];
}

interface ReviewReferenceFile {
  filename: string;
  content?: string | null;
  ast?: object | null;
}

interface ReviewProblemContext {
  key: string;
  title: string;
  description_en: string;
  reference_solution?: string | null;
  reference_ast?: object | null;
  references: ReviewReferenceFile[];
}

interface ReviewAttemptDetail {
  id: string;
  user_id: string;
  username: string;
  task_ref: string;
  passed?: boolean | null;
  timestamp: string;
  confidence_level?: number | null;
  student_code?: string | null;
  student_ast?: object | null;
  misconceptions: Misconception[];
  problem?: ReviewProblemContext | null;
}

const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

function PassedPill({ passed }: { passed?: boolean | null }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> Correct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
      <XCircle className="h-3 w-3" /> Incorrect
    </span>
  );
}

function MisconceptionCards({ misconceptions }: { misconceptions: Misconception[] }) {
  if (misconceptions.length === 0) {
    return (
      <p className="text-[11px] font-semibold text-slate-400 px-1">
        No misconceptions were detected for this attempt.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {misconceptions.map((m, idx) => (
        <div key={idx} className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-1">
          <div className="text-[11px] font-bold text-slate-800">
            {m.title}
            {m.code && m.code !== 'GEN' && (
              <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded-full">{m.code}</span>
            )}
          </div>
          {m.description && (
            <p className="text-[10px] text-slate-600 leading-relaxed">{m.description}</p>
          )}
          {m.detail && (
            <p className="text-[10px] text-slate-500 leading-relaxed">{m.detail}</p>
          )}
          {m.buggy_expr && (
            <div className="text-[10px] font-mono text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 overflow-x-auto whitespace-pre">
              {m.buggy_expr}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MisconceptionReview() {
  const [attempts, setAttempts] = useState<ReviewAttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [onlyMisconceptions, setOnlyMisconceptions] = useState(false);
  const [problemFilter, setProblemFilter] = useState('');

  // Detail view
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ReviewAttemptDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [astExpanded, setAstExpanded] = useState(true);
  const [selectedRefIdx, setSelectedRefIdx] = useState(0);

  const fetchAttempts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/review/attempts');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load submissions.');
      }
      setAttempts(await res.json());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, []);

  const openDetail = async (attemptId: string) => {
    setSelectedAttemptId(attemptId);
    setView('detail');
    setAstExpanded(true);
    setSelectedRefIdx(0);
    if (detailCache[attemptId]) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/review/attempts/${attemptId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load attempt detail.');
      }
      const data = await res.json();
      setDetailCache(prev => ({ ...prev, [attemptId]: data }));
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading the attempt detail.');
      setView('list');
    } finally {
      setDetailLoading(false);
    }
  };

  // Distinct problems present in the data, for the filter dropdown
  const problemOptions = Array.from(
    new Map(attempts.map(a => [a.task_ref, a.problem_title || a.task_ref])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filteredAttempts = attempts.filter(a =>
    (!onlyMisconceptions || a.misconceptions.length > 0) &&
    (!problemFilter || a.task_ref === problemFilter)
  );

  // ---------- Detail view ----------
  if (view === 'detail' && selectedAttemptId) {
    const detail = detailCache[selectedAttemptId];

    if (detailLoading || !detail) {
      return (
        <div className="space-y-4">
          {/* Header skeleton */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-56" />
              <Skeleton className="h-2.5 w-72" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          {/* Misconceptions skeleton */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <Skeleton className="h-3 w-56" />
            <SkeletonText lines={3} />
          </div>
          {/* Code comparison skeleton */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[0, 1].map(i => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50">
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-56 w-full rounded-none bg-slate-800/90" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Reference files uploaded via the instructor Problems page; the legacy
    // inline reference_solution column is the fallback when none exist.
    const refFiles = detail.problem?.references ?? [];
    const selectedRef = refFiles.length > 0
      ? refFiles[Math.min(selectedRefIdx, refFiles.length - 1)]
      : null;
    const referenceCode = selectedRef ? selectedRef.content : detail.problem?.reference_solution;
    const referenceAst = selectedRef ? selectedRef.ast : detail.problem?.reference_ast;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
            title="Back to submissions list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold text-slate-900 truncate">
              {detail.problem?.title || detail.task_ref}
            </h2>
            <p className="text-[10px] text-slate-500 font-semibold">
              {detail.username} · <span className="font-mono">{detail.task_ref}</span> · {formatTime(detail.timestamp)}
            </p>
          </div>
          <PassedPill passed={detail.passed} />
        </div>

        {/* Misconceptions */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider">
              Detected Misconceptions ({detail.misconceptions.length})
            </h3>
          </div>
          <MisconceptionCards misconceptions={detail.misconceptions} />
        </div>

        {/* Code comparison */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center space-x-2 text-slate-800">
              <Code2 className="h-3.5 w-3.5 text-pink-600" />
              <span className="text-[11px] font-bold">Student Submission</span>
            </div>
            {detail.student_code != null ? (
              <div className="bg-slate-900 p-1">
                <DapCodeEditor value={detail.student_code} onChange={() => { }} readOnly rows={14} />
              </div>
            ) : (
              <div className="min-h-32 flex items-center justify-center border border-dashed border-slate-200 m-3 rounded-xl">
                <span className="text-[11px] font-semibold text-slate-400">Code unavailable in storage.</span>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 text-slate-800">
              <div className="flex items-center space-x-2">
                <Code2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[11px] font-bold">Reference Solution</span>
              </div>
              {refFiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {refFiles.map((rf, idx) => (
                    <button
                      key={rf.filename}
                      type="button"
                      onClick={() => setSelectedRefIdx(idx)}
                      className={`px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold transition-all cursor-pointer ${idx === Math.min(selectedRefIdx, refFiles.length - 1)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                    >
                      {rf.filename}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {referenceCode ? (
              <div className="bg-slate-900 p-1">
                <DapCodeEditor value={referenceCode} onChange={() => { }} readOnly rows={14} />
              </div>
            ) : (
              <div className="min-h-32 flex items-center justify-center border border-dashed border-slate-200 m-3 rounded-xl">
                <span className="text-[11px] font-semibold text-slate-400">This problem has no reference solution.</span>
              </div>
            )}
          </div>
        </div>

        {/* AST comparison (collapsible) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <button
            type="button"
            onClick={() => setAstExpanded(e => !e)}
            className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors rounded-2xl"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AST Comparison (Abstract Syntax Trees)
            </span>
            {astExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {astExpanded && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 pt-0">
              <AstPanel
                title="Student AST"
                ast={detail.student_ast ?? null}
                emptyNote="AST not available — the attempt did not compile."
              />
              <AstPanel
                title={selectedRef ? `Reference AST (${selectedRef.filename})` : 'Reference AST'}
                ast={referenceAst ?? null}
                emptyNote="Reference AST not available — the problem has no compiled reference solution."
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- List view ----------
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
              Student Submissions ({filteredAttempts.length})
            </h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Misconceptions are detected only on incorrect submissions that compile — &quot;None detected&quot; does not imply the code was verified.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={problemFilter}
              onChange={(e) => setProblemFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 focus:border-pink-400 focus:outline-hidden"
            >
              <option value="">All problems</option>
              {problemOptions.map(([key, title]) => (
                <option key={key} value={key}>{title}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyMisconceptions}
                onChange={(e) => setOnlyMisconceptions(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-pink-600 focus:ring-pink-500"
              />
              <span className="text-[11px] font-semibold text-slate-600">Only with misconceptions</span>
            </label>
            <button
              onClick={fetchAttempts}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : filteredAttempts.length === 0 ? (
          <div className="py-12 text-center">
            <FileSearch className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs text-slate-400 font-medium">
              {attempts.length === 0 ? 'No student submissions yet.' : 'No submissions match the current filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredAttempts.map((attempt) => (
              <div
                key={attempt.id}
                className="rounded-xl border border-slate-150 bg-slate-50/30 hover:border-pink-200 hover:bg-pink-50/10 transition-all p-3.5 flex flex-wrap items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-800">{attempt.username}</span>
                    <span className="text-[11px] font-semibold text-slate-500 truncate">
                      {attempt.problem_title || attempt.task_ref}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.2 rounded-md">
                      {attempt.task_ref}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatTime(attempt.timestamp)}</p>
                </div>

                <PassedPill passed={attempt.passed} />

                {attempt.misconceptions.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    <AlertCircle className="h-3 w-3" />
                    {attempt.misconceptions.length} misconception{attempt.misconceptions.length !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    None detected
                  </span>
                )}

                <button
                  onClick={() => openDetail(attempt.id)}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[11px] font-bold bg-pink-600 text-white hover:bg-pink-700 transition-all hover:shadow-md cursor-pointer"
                >
                  <span>Review</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
