'use client';

// Renders one AMT-CS1 native activity block (a Homework or Checkpoint context):
// KPIs + concepts-to-review + per-problem attempt history with a lazy code viewer.
// Shared by the student "My History" tabs and the teacher interaction drill-down.

import React, { useState } from 'react';
import {
  ChevronRight, CheckCircle, Activity, ClipboardList, RefreshCw, Code2, Inbox,
} from 'lucide-react';
import type { AmtBlock } from '@/lib/amt-types';
import { KpiCard, StateBadge, MisconceptionPanel } from './ui';
import { pct, num, dateTime } from './formatters';

function AttemptCode({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!open && code === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/attempts/${attemptId}/code`);
        const d = await res.json();
        setCode(res.ok ? (d.code ?? '') : (d.error || 'Failed to load code'));
      } catch {
        setCode('Failed to load code');
      } finally {
        setLoading(false);
      }
    }
    setOpen((o) => !o);
  };

  return (
    <div className="mt-1.5">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
      >
        <Code2 className="h-3 w-3" /> {open ? 'Hide code' : 'View code'}
      </button>
      {open && (
        loading ? (
          <p className="text-[10px] text-slate-400 italic mt-1">Loading…</p>
        ) : (
          <pre className="mt-1 text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
            {code || '—'}
          </pre>
        )
      )}
    </div>
  );
}

function attemptState(passed: boolean | null): string | null {
  return passed == null ? null : passed ? 'passed' : 'failed';
}

export function NativeBlock({
  block,
  emptyLabel = 'No activity here yet.',
  misconceptionSubtitle,
}: {
  block: AmtBlock;
  emptyLabel?: string;
  misconceptionSubtitle?: string;
}) {
  const [openProblem, setOpenProblem] = useState<string | null>(null);

  if (block.kpis.problems_attempted === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-14 text-center shadow-xs">
        <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-500">{emptyLabel}</p>
        <p className="text-xs text-slate-400 mt-1">Your submissions will show up here as you work.</p>
      </div>
    );
  }

  const { kpis } = block;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Problems attempted" value={String(kpis.problems_attempted)} accentClass="text-teal-500/70" icon={<ClipboardList className="h-4 w-4" />} />
        <KpiCard label="Solved" value={`${kpis.problems_solved}/${kpis.problems_attempted}`} accentClass="text-teal-500/70" icon={<CheckCircle className="h-4 w-4" />} />
        <KpiCard label="Total attempts" value={String(kpis.total_attempts)} sub={`avg ${num(kpis.avg_attempts_per_problem)} / problem`} accentClass="text-teal-500/70" icon={<RefreshCw className="h-4 w-4" />} />
        <KpiCard label="Solve rate" value={pct(kpis.solve_rate)} accentClass="text-teal-500/70" icon={<Activity className="h-4 w-4" />} />
      </div>

      {block.misconceptions.length > 0 && (
        <MisconceptionPanel
          items={block.misconceptions}
          title="Concepts to review"
          subtitle={misconceptionSubtitle || 'Detected from your code — these topics came up as areas to revisit.'}
        />
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Problems ({block.problems.length})</h3>
        {block.problems.map((p) => {
          const open = openProblem === p.task_ref;
          return (
            <div key={p.task_ref} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
              <button
                onClick={() => setOpenProblem(open ? null : p.task_ref)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-800 truncate">{p.title || p.task_ref}</h4>
                    <StateBadge state={p.solved ? 'passed' : 'failed'} />
                  </div>
                  <p className="text-[11px] text-slate-450 mt-0.5">
                    {p.attempts_count} attempt{p.attempts_count !== 1 ? 's' : ''}
                    {p.solved && p.first_solved_at ? ` · solved ${dateTime(p.first_solved_at)}` : ' · not solved yet'}
                  </p>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>

              {open && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {p.attempts.map((a, i) => (
                    <div key={a.id} className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-slate-400 w-10 shrink-0">#{i + 1}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">{dateTime(a.timestamp)}</span>
                        <StateBadge state={attemptState(a.passed)} />
                        <div className="flex flex-wrap gap-1 ml-auto">
                          {a.misconception_tags.map((t) => (
                            <span key={t} className="rounded-full border border-fuchsia-150 bg-fuchsia-50 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-700">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <AttemptCode attemptId={a.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
