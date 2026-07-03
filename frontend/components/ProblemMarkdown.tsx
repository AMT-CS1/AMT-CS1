'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders a problem statement (homework / practicum) as Markdown, styled to
 * match the compact statement panel: bold section labels, numbered
 * instructions, inline code chips, and dark fenced code blocks.
 */
export default function ProblemMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[11px] text-slate-600 leading-relaxed space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-sm font-extrabold text-slate-800 mt-3 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-extrabold text-slate-800 mt-3 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[11px] font-extrabold text-slate-800 mt-2 first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="text-[11px] text-slate-600 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-slate-800">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-[11px] text-slate-600 leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-500 italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-slate-150 my-3" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-bold text-slate-700">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1">{children}</td>,
          pre: ({ children }) => (
            <pre className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[10px] font-mono leading-relaxed overflow-x-auto border border-slate-800 [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0 [&_code]:text-slate-100">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="font-mono text-[10px] font-semibold text-indigo-700 bg-indigo-50/70 border border-indigo-100 rounded px-1 py-0.5">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
