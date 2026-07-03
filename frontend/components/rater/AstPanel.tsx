'use client';

import { Braces } from 'lucide-react';

function countNodes(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce((sum: number, child) => sum + countNodes(child), 0);
  }
  if (node && typeof node === 'object') {
    return 1 + Object.values(node).reduce((sum: number, child) => sum + countNodes(child), 0);
  }
  return 0;
}

export default function AstPanel({
  title,
  ast,
  emptyNote,
}: {
  title: string;
  ast: object | null;
  emptyNote: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-800">
          <Braces className="h-3.5 w-3.5 text-pink-600" />
          <span className="text-[11px] font-bold">{title}</span>
        </div>
        {ast && (
          <span className="text-[9px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">
            {countNodes(ast)} nodes
          </span>
        )}
      </div>
      {ast ? (
        <pre className="text-[10px] font-mono bg-slate-900 text-slate-100 p-4 overflow-auto max-h-[28rem] leading-relaxed flex-1">
          {JSON.stringify(ast, null, 2)}
        </pre>
      ) : (
        <div className="flex-1 min-h-32 flex items-center justify-center border border-dashed border-slate-200 m-3 rounded-xl">
          <span className="text-[11px] font-semibold text-slate-400 px-4 text-center">{emptyNote}</span>
        </div>
      )}
    </div>
  );
}
