'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Play, Code2, CheckCircle2, XCircle, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';

interface WeeklyTarget {
  id: string;
  course_ref: string;
  week: number;
  topic_kc_focus: string;
  target_task: string;
  source: string;
}

interface StudentWorkspaceProps {
  initialTargets: WeeklyTarget[];
}

const STARTER_CODES: Record<string, string> = {
  'swap-variables': `program SwapVariables
dictionary
    x, y, temp : integer
algorithm
    read x
    read y
    
    // Write your swapping logic here:
    temp <- x
    x <- y
    y <- temp
    
    write x
    write y
endprogram`,
  'factorial': `program Factorial
dictionary
    n, fact, i : integer
algorithm
    read n
    fact <- 1
    i <- 1
    
    // Write a loop here to compute the factorial:
    while i <= n do
        fact <- fact * i
        i <- i + 1
    endwhile
    
    write fact
endprogram`,
  'generic': `program HomeworkTask
dictionary
    // Define your variables here
algorithm
    // Write your logic here
endprogram`
};

const getTaskRef = (kcFocus: string): string => {
  const focus = kcFocus.toLowerCase();
  if (focus.includes('variables') || focus.includes('swapping')) return 'swap-variables';
  if (focus.includes('loop') || focus.includes('factorial')) return 'factorial';
  return 'generic';
};

interface Problem {
  id: string;
  key: string;
  title: string;
  description: string;
  starter_code: string;
  test_cases: any[];
}

export default function StudentWorkspace({ initialTargets }: StudentWorkspaceProps) {
  const [targets] = useState<WeeklyTarget[]>(initialTargets || []);
  const [problems, setProblems] = useState<Problem[]>([]);
  
  const [selectedTarget, setSelectedTarget] = useState<WeeklyTarget | null>(() => {
    return initialTargets && initialTargets.length > 0 ? initialTargets[0] : null;
  });

  const getProblemForTarget = (target: WeeklyTarget | null): Problem | null => {
    if (!target) return null;
    const ref = getTaskRef(target.topic_kc_focus);
    let found = problems.find(p => p.key === ref);
    if (found) return found;

    // Substring KC match fallback
    found = problems.find(p => 
      p.key.toLowerCase().includes(target.topic_kc_focus.toLowerCase()) ||
      target.topic_kc_focus.toLowerCase().includes(p.key.toLowerCase())
    );
    if (found) return found;

    return null;
  };

  const [code, setCode] = useState(() => {
    const firstTarget = initialTargets && initialTargets.length > 0 ? initialTargets[0] : null;
    if (firstTarget) {
      const ref = getTaskRef(firstTarget.topic_kc_focus);
      return STARTER_CODES[ref] || '';
    }
    return '';
  });

  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch problems on mount
  useEffect(() => {
    const fetchProblems = async () => {
      try {
        const res = await fetch('/api/problems');
        if (res.ok) {
          const data = await res.json();
          setProblems(data);
        }
      } catch (err) {
        console.error('Failed to load problems:', err);
      }
    };
    fetchProblems();
  }, []);

  // Update code template once problems load or selection changes
  useEffect(() => {
    if (selectedTarget) {
      const prob = getProblemForTarget(selectedTarget);
      if (prob) {
        setCode(prob.starter_code);
      } else {
        const ref = getTaskRef(selectedTarget.topic_kc_focus);
        setCode(STARTER_CODES[ref] || '');
      }
    }
  }, [selectedTarget, problems]);

  const handleSelectTarget = (target: WeeklyTarget) => {
    setSelectedTarget(target);
    const prob = getProblemForTarget(target);
    if (prob) {
      setCode(prob.starter_code);
    } else {
      const ref = getTaskRef(target.topic_kc_focus);
      setCode(STARTER_CODES[ref] || '');
    }
    setEvalResult(null);
    setErrorMessage('');
  };

  const resetTemplate = () => {
    if (selectedTarget) {
      const prob = getProblemForTarget(selectedTarget);
      if (prob) {
        setCode(prob.starter_code);
      } else {
        const ref = getTaskRef(selectedTarget.topic_kc_focus);
        setCode(STARTER_CODES[ref] || '');
      }
      setEvalResult(null);
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget) return;

    setSubmitting(true);
    setEvalResult(null);
    setErrorMessage('');

    const prob = getProblemForTarget(selectedTarget);
    const taskRef = prob ? prob.key : getTaskRef(selectedTarget.topic_kc_focus);

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_ref: taskRef,
          content: code,
          source: 'manual',
          confidence_level: 1.0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }

      setEvalResult(data);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to submit attempt. Please make sure the backend is active.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Supportive Banner */}
      <div className="rounded-2xl border border-teal-150 bg-gradient-to-r from-teal-50/70 to-emerald-50/70 p-6 shadow-xs">
        <div className="flex items-start space-x-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600">
            <Sparkles className="h-5.5 w-5.5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              DAP Interactive Playground
            </h1>
            <p className="mt-1 text-sm text-slate-650 leading-relaxed">
              DAP is a friendly pseudocode language designed to build logical thinking.
              Select a task from the list, write your algorithm in the editor, and submit to run it against the test cases.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Tasks & Problem description */}
        <div className="lg:col-span-5 space-y-6">
          {/* Target List */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Select Homework
            </h2>
            <div className="space-y-2.5">
              {targets.length === 0 ? (
                <p className="text-xs text-slate-400">No active homeworks found. Run the seed script.</p>
              ) : (
                targets.map((target) => {
                  const active = selectedTarget?.id === target.id;
                  return (
                    <button
                      key={target.id}
                      onClick={() => handleSelectTarget(target)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        active
                          ? 'border-teal-500 bg-teal-50/40 text-teal-900 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-400">Homework {target.week}</span>
                        <span className="text-sm font-bold mt-0.5">{getProblemForTarget(target)?.title || target.topic_kc_focus}</span>
                        <span className="text-[10px] text-slate-500 mt-1">Focus: {target.topic_kc_focus}</span>
                      </div>
                      <ChevronRight className={`h-4.5 w-4.5 transition-transform ${active ? 'text-teal-600 translate-x-0.5' : 'text-slate-400'}`} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected Task Details */}
          {selectedTarget && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div>
                <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 ring-1 ring-inset ring-teal-600/10">
                  Homework {selectedTarget.week}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-2">
                  {getProblemForTarget(selectedTarget)?.title || selectedTarget.topic_kc_focus}
                </h3>
              </div>
              <div className="prose prose-sm text-slate-650 max-w-none text-xs leading-relaxed border-t border-slate-100 pt-4 whitespace-pre-line">
                {getProblemForTarget(selectedTarget)?.description || selectedTarget.target_task}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Code Editor & Execution Status */}
        <div className="lg:col-span-7 space-y-6">
          {/* Editor Form */}
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-800">
                <Code2 className="h-4.5 w-4.5 text-teal-600" />
                <span className="text-sm font-bold">Pseudocode Workspace (.dap)</span>
              </div>
              <button
                type="button"
                onClick={resetTemplate}
                className="flex items-center space-x-1 text-slate-400 hover:text-slate-600 transition-colors text-xs font-semibold"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset Template</span>
              </button>
            </div>

            <div className="relative bg-slate-900 p-1">
              <DapCodeEditor
                value={code}
                onChange={setCode}
                rows={14}
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Compiler: DAP compiler (Go build)</span>
              <button
                type="submit"
                disabled={submitting || !selectedTarget}
                className="flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-105 hover:shadow-lg active:scale-[0.98] disabled:scale-100 px-6 py-3 text-xs font-bold text-white transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Evaluating Code...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-white" />
                    <span>Run & Verify Code</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Results panel */}
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 text-xs text-red-800 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {evalResult && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-sm font-bold text-slate-800">Verification Result</h3>
                
                {evalResult.success && evalResult.passed ? (
                  <div className="flex items-center text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold gap-1.5 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Passed All Test Cases!</span>
                  </div>
                ) : !evalResult.success ? (
                  <div className="flex items-center text-red-700 bg-red-50 border border-red-250 px-3 py-1 rounded-full text-xs font-bold gap-1.5 shadow-2xs">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>Compilation Error</span>
                  </div>
                ) : (
                  <div className="flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold gap-1.5 shadow-2xs">
                    <XCircle className="h-4 w-4 text-amber-500" />
                    <span>Failed Test Cases</span>
                  </div>
                )}
              </div>

              {/* Compilation error box */}
              {evalResult.compilation_error && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">Compiler Diagnostic Logs</h4>
                  <pre className="p-4 bg-slate-900 rounded-xl text-xs font-mono text-red-400 overflow-x-auto border border-slate-800 leading-relaxed">
                    {evalResult.compilation_error}
                  </pre>
                </div>
              )}

              {/* Tutor Feedback Card */}
              {evalResult.feedback && (
                <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-purple-50/40 p-4 space-y-2.5">
                  <div className="flex items-center space-x-2 text-indigo-900">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-600">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider">Tutor Guidance</span>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {evalResult.feedback}
                  </div>
                </div>
              )}

              {/* Individual test cases */}
              {evalResult.test_results && evalResult.test_results.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-700">Test Case Results</h4>
                  <div className="space-y-3">
                    {evalResult.test_results.map((tc: any) => (
                      <div key={tc.test_case_index} className="rounded-xl border border-slate-150 p-4 space-y-3 bg-slate-50/50">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">Test Case #{tc.test_case_index}</span>
                          {tc.passed ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Pass
                            </span>
                          ) : (
                            <span className="text-red-700 font-bold bg-red-55/10 px-2 py-0.5 rounded-md border border-red-150 flex items-center gap-1 text-[11px]">
                              <XCircle className="h-3.5 w-3.5 text-red-500" /> Fail
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-sans block font-semibold">Stdin Input</span>
                            <div className="p-2 bg-white border border-slate-200 rounded-md text-slate-700 whitespace-pre">{tc.input || '(empty)'}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-sans block font-semibold">Expected Output</span>
                            <div className="p-2 bg-white border border-slate-200 rounded-md text-slate-700 whitespace-pre">{tc.expected}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 font-sans block font-semibold">Actual Output</span>
                            <div className={`p-2 border rounded-md whitespace-pre ${tc.passed ? 'bg-white border-slate-200 text-slate-700' : 'bg-red-50/30 border-red-150 text-red-700'}`}>
                              {tc.error ? `Error: ${tc.error}` : (tc.actual || '(no output)')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
