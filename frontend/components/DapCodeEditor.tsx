'use client';

import React, { useRef } from 'react';

interface DapCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
}

export default function DapCodeEditor({
  value,
  onChange,
  placeholder = '// Write your DAP program here...',
  rows = 14,
  readOnly = false,
}: DapCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Sync scrolling of textarea to the highlight overlay
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const indentation = '    '; // 4 spaces for DAP
      const newValue = value.substring(0, start) + indentation + value.substring(end);

      onChange(newValue);

      // Restore cursor position immediately after state updates
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + indentation.length;
        if (preRef.current) {
          preRef.current.scrollTop = textarea.scrollTop;
          preRef.current.scrollLeft = textarea.scrollLeft;
        }
      }, 0);
    }
  };

  const highlightDapCode = (code: string): string => {
    if (!code) return '';

    // Lexical single-pass regex rules for DAP syntax tokenizing
    const patterns = [
      { name: 'comment', regex: /\/\/.*|#.*/ },
      { name: 'string', regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
      { name: 'keyword', regex: /\b(?:program|dictionary|kamus|algorithm|endprogram|if|then|else|endif|while|do|endwhile|for|to|endfor|read|write|input|output|print)\b/ },
      { name: 'type', regex: /\b(?:integer|real|string|boolean|char)\b/ },
      { name: 'operator', regex: /<-|<=|>=|!=|[-+*/=]/ },
      { name: 'number', regex: /\b\d+\b/ },
      { name: 'other', regex: /[\s\S]/ }
    ];

    const combinedRegex = new RegExp(
      patterns.map(p => `(${p.regex.source})`).join('|'),
      'ig'
    );

    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    return code.replace(combinedRegex, (match, ...args) => {
      for (let i = 0; i < patterns.length; i++) {
        if (args[i] !== undefined) {
          const tokenValue = escapeHtml(match);
          if (patterns[i].name === 'keyword') {
            return `<span style="color: #1e66f5; font-weight: bold;">${tokenValue}</span>`;
          }
          if (patterns[i].name === 'type') {
            return `<span style="color: #179287; font-weight: bold;">${tokenValue}</span>`;
          }
          if (patterns[i].name === 'comment') {
            return `<span style="color: #7c7f93; font-style: italic;">${tokenValue}</span>`;
          }
          if (patterns[i].name === 'string') {
            return `<span style="color: #40a02b; font-weight: 600;">${tokenValue}</span>`;
          }
          if (patterns[i].name === 'operator') {
            return `<span style="color: #ea76cb; font-weight: bold;">${tokenValue}</span>`;
          }
          if (patterns[i].name === 'number') {
            return `<span style="color: #fe640b; font-weight: 500;">${tokenValue}</span>`;
          }
          return tokenValue;
        }
      }
      return escapeHtml(match);
    });
  };

  return (
    <div className="relative w-full rounded-lg bg-[#eff1f5] border border-[#ccd0da] font-mono text-xs overflow-hidden dap-editor-container">
      {/* Scrollable Highlighted Pre Element */}
      <pre
        ref={preRef}
        aria-hidden="true"
        className="w-full pointer-events-none absolute top-0 left-0 m-0 p-4 leading-relaxed whitespace-pre overflow-hidden text-[#4c4f69]"
        style={{
          height: `${rows * 1.5 + 2}rem`,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
        dangerouslySetInnerHTML={{ __html: highlightDapCode(value) + '\n' }}
      />

      {/* Transparent Textarea Overlay */}
      <textarea
        spellCheck={false}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        readOnly={readOnly}
        className="w-full block m-0 p-4 bg-transparent text-transparent caret-[#1e66f5] focus:outline-hidden focus:ring-0 border-0 resize-none leading-relaxed whitespace-pre overflow-auto placeholder-[#acb0be]"
        style={{
          height: `${rows * 1.5 + 2}rem`,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      />
    </div>
  );
}
