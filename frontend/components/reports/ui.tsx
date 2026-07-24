'use client';

// Shared presentational primitives for the report dashboards (LMS + AMT-CS1).
// Extracted from the teacher/student report pages so both report families share
// one visual language instead of re-deriving it.

import React from 'react';
import { Brain } from 'lucide-react';
import { pct } from './formatters';

// ---------- KPI card ----------

export function KpiCard({
  label,
  value,
  sub,
  icon,
  accentClass = 'text-slate-300',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  /** Tailwind text-color for the icon (teal on student pages, slate on teacher). */
  accentClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={accentClass}>{icon}</span>
      </div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</div>
      {sub && <div className="text-[11px] text-slate-450 mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------- rate meter ----------

export function RateBar({ rate }: { rate: number | null }) {
  const p = rate == null ? 0 : Math.round(rate * 100);
  const color = p >= 75 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-[11px] font-bold text-slate-600 tabular-nums w-9 text-right">{pct(rate)}</span>
    </div>
  );
}

// ---------- Moodle / attempt state badge ----------

const STATE_STYLES: Record<string, string> = {
  gradedright: 'bg-emerald-50 text-emerald-700 border-emerald-150',
  gradedwrong: 'bg-rose-50 text-rose-700 border-rose-150',
  gaveup: 'bg-slate-100 text-slate-500 border-slate-200',
  gradedpartial: 'bg-amber-50 text-amber-700 border-amber-150',
  // AMT-CS1 native pass/fail, so the same badge works for both report families.
  passed: 'bg-emerald-50 text-emerald-700 border-emerald-150',
  failed: 'bg-rose-50 text-rose-700 border-rose-150',
};

export function StateBadge({ state }: { state: string | null }) {
  const cls = (state && STATE_STYLES[state]) || 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${cls}`}>
      {state || 'unanswered'}
    </span>
  );
}

// ---------- misconception panel (shared shape) ----------

export interface MisconceptionItem {
  tag: string;
  name: string;
  /** wrong/occurrence count — schemas use `wrong_count` (LMS) or `count` (AMT). */
  wrong_count?: number;
  count?: number;
}

export function MisconceptionPanel({
  items,
  title = 'Misconceptions',
  subtitle,
  showTag = false,
}: {
  items: MisconceptionItem[];
  title?: string;
  subtitle?: string;
  /** Show the two-letter tag alongside the name (teacher view). */
  showTag?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-2.5">
        <Brain className="h-4.5 w-4.5 text-fuchsia-600" />
        <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
      </div>
      {subtitle && <p className="text-[11px] text-slate-500 mb-3">{subtitle}</p>}
      <div className="flex flex-wrap gap-2">
        {items.map((m) => {
          const c = m.wrong_count ?? m.count ?? 0;
          return (
            <span
              key={m.tag}
              className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-150 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-800"
            >
              {m.name}
              {showTag && <span className="text-fuchsia-500">({m.tag})</span>}
              <span className="ml-0.5 rounded-full bg-white px-1.5 text-fuchsia-700">{c}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------- tab strip ----------

export interface TabDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold -mb-px border-b-2 transition-colors ${
              isActive
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
