'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Play, Code2, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, ChevronRight, ArrowLeft,
  Lock, Unlock, Calendar, Award, BookOpen, Clock
} from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';

interface WeeklyTarget {
  id: string;
  course_ref: string;
  week: number;
  topic_kc_focus: string;
  target_task: string;
  source: string;
  title?: string;
  description?: string;
  deadline?: string;
}

interface StudentWorkspaceProps {
  initialTargets: WeeklyTarget[];
  selectedTargetId?: string;
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
  if (focus === 'lo, va' || focus === 'lo,va' || focus.includes('sum-n')) return 'sum-n';
  if (focus === 'cd, lo, ex' || focus === 'cd,lo,ex' || focus.includes('sum-evens')) return 'sum-evens';
  if (focus === 'va' || focus.includes('variables') || focus.includes('swapping') || focus.includes('variable')) return 'swap-variables';
  if (focus === 'lo' || focus.includes('loop') || focus.includes('factorial') || focus.includes('loops')) return 'factorial';
  if (focus === 'co' || focus.includes('constant') || focus.includes('constants') || focus.includes('circle')) return 'circle-calc';
  if (focus === 'op' || focus.includes('operator') || focus.includes('operators') || focus.includes('even')) return 'even-odd';
  if (focus === 'ex' || focus.includes('expression') || focus.includes('expressions') || focus.includes('quadratic')) return 'quadratic-eval';
  if (focus === 'io' || focus.includes('input') || focus.includes('output') || focus.includes('greeting')) return 'greeting-gen';
  if (focus === 'cd' || focus.includes('conditional') || focus.includes('conditionals') || focus.includes('maximum') || focus.includes('max')) return 'max-three';
  return 'generic';
};

const getKcDisplayName = (topic: string): string => {
  if (!topic) return '';
  return topic.split(',')
    .map(s => {
      const t = s.trim().toLowerCase();
      if (t === 'co' || t.includes('circle') || t.includes('constant')) return 'Constant';
      if (t === 'va' || t.includes('swap-variables') || t.includes('swapping') || t.includes('variable')) return 'Variable';
      if (t === 'op' || t.includes('even-odd') || t.includes('even') || t.includes('operator')) return 'Operation';
      if (t === 'ex' || t.includes('quadratic-eval') || t.includes('quadratic') || t.includes('expression')) return 'Expression';
      if (t === 'io' || t.includes('greeting-gen') || t.includes('greeting') || t.includes('input') || t.includes('output')) return 'InputOutput';
      if (t === 'cd' || t.includes('max-three') || t.includes('maximum') || t.includes('conditional')) return 'Conditional';
      if (t === 'lo' || t.includes('factorial') || t.includes('loop')) return 'Loop';
      return s.trim();
    })
    .join(', ');
};

const getDeadlineForWeek = (week: number): string => {
  if (week === 1) return 'Sunday, Jun 28, 2026 at 11:59 PM';
  if (week === 2) return 'Sunday, Jul 5, 2026 at 11:59 PM';
  if (week === 3) return 'Sunday, Jul 12, 2026 at 11:59 PM';
  return `Sunday, Jul ${12 + (week - 3) * 7}, 2026 at 11:59 PM`;
};

const formatDeadline = (dateStr: string): string => {
  const d = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  const dateFormatted = d.toLocaleDateString('en-US', options);
  const timeFormatted = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${dateFormatted} at ${timeFormatted}`;
};

interface QuizQuestion {
  type: 'mc' | 'sa';
  text: string;
  code?: string;
  options?: string[];
  answer: string;
  explanation: string;
}

interface Problem {
  id: string;
  key: string;
  title: string;
  description_en: string;
  description_id: string;
  starter_code: string;
  test_cases: any[];
}

export default function StudentWorkspace({ initialTargets, selectedTargetId }: StudentWorkspaceProps) {
  const router = useRouter();
  const [targets] = useState<WeeklyTarget[]>(() => {
    return [...(initialTargets || [])].sort((a, b) => a.week - b.week);
  });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [descLang, setDescLang] = useState<'en' | 'id'>('en');

  // Derived state based on the routing parameters
  const selectedTarget = selectedTargetId
    ? targets.find(t => t.id === selectedTargetId) || null
    : null;
  const view = selectedTarget ? 'editor' : 'list';

  const [solvedTargetIds, setSolvedTargetIds] = useState<string[]>([]);
  const [code, setCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Hint / Concept Check Quiz States
  const [lastSubmissionTime, setLastSubmissionTime] = useState<number>(Date.now());
  const [showHintPrompt, setShowHintPrompt] = useState(false);
  const [inHintQuiz, setInHintQuiz] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [shortAnswer, setShortAnswer] = useState<string>('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [checkingQuizStatus, setCheckingQuizStatus] = useState(false);
  const [quizFinishedKeys, setQuizFinishedKeys] = useState<string[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (view !== 'editor' || inHintQuiz) {
      setShowHintPrompt(false);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastSubmissionTime;
      if (elapsed >= 60000) {
        setShowHintPrompt(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [view, lastSubmissionTime, inHintQuiz]);

  const handleStartHintQuiz = async () => {
    if (!selectedTarget) return;
    setQuizLoading(true);
    setInHintQuiz(true);
    setQuizIndex(0);
    setSelectedOption('');
    setShortAnswer('');
    setIsAnswered(false);
    setIsAnswerCorrect(false);

    const prob = getProblemForTarget(selectedTarget);
    const taskRef = prob ? prob.key : getTaskRef(selectedTarget.topic_kc_focus);
    const title = selectedTarget.title || prob?.title || getKcDisplayName(selectedTarget.topic_kc_focus);
    const probDescription = descLang === 'id' ? prob?.description_id : prob?.description_en;
    const desc = probDescription || selectedTarget.description || selectedTarget.target_task;

    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kc_focus: selectedTarget.topic_kc_focus,
          problem_key: taskRef,
          problem_title: title,
          problem_description: desc,
          lang: descLang
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate intermediate exercises');
      }

      const data = await res.json();
      if (data.questions && data.questions.length >= 3) {
        setQuizQuestions(data.questions);
      } else {
        throw new Error('Invalid questions count returned');
      }
    } catch (err) {
      console.error('Failed to fetch intermediate exercises via API.', err);
      setQuizQuestions([]);
      setInHintQuiz(false);
      alert('Failed to load hint quizzes. Please try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleCheckAnswer = async () => {
    const currentQuestion = quizQuestions[quizIndex];
    if (!currentQuestion) return;

    let correct = false;
    if (currentQuestion.type === 'mc') {
      correct = selectedOption === currentQuestion.answer;
    } else {
      // Lenient matching: trim, lowercase, strip spaces and punctuation except '<-'
      const cleanInput = shortAnswer.trim().toLowerCase().replace(/[^a-z0-9<-]/g, '');
      const cleanAnswer = currentQuestion.answer.trim().toLowerCase().replace(/[^a-z0-9<-]/g, '');
      correct = cleanInput === cleanAnswer || shortAnswer.trim().toLowerCase() === currentQuestion.answer.toLowerCase();
    }

    setIsAnswerCorrect(correct);
    setIsAnswered(true);

    // Proactively notify backend of quiz completion if final question is correct
    if (quizIndex === 2 && correct && selectedTarget) {
      const prob = getProblemForTarget(selectedTarget);
      const taskRef = prob ? prob.key : getTaskRef(selectedTarget.topic_kc_focus);

      try {
        await fetch('/api/exercises', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _action: 'complete',
            problem_key: taskRef,
            questions_answered: 3
          })
        });
        setQuizFinishedKeys(prev => {
          if (prev.includes(taskRef)) return prev;
          return [...prev, taskRef];
        });
      } catch (e) {
        console.error('Failed to notify backend of quiz completion in checkAnswer', e);
      }
    }
  };

  const handleNextQuestion = () => {
    if (quizIndex < 2) {
      setQuizIndex(prev => prev + 1);
      setSelectedOption('');
      setShortAnswer('');
      setIsAnswered(false);
      setIsAnswerCorrect(false);
    } else {
      // Completed all 3 exercises
      if (selectedTarget) {
        const prob = getProblemForTarget(selectedTarget);
        const taskRef = prob ? prob.key : getTaskRef(selectedTarget.topic_kc_focus);
        setQuizFinishedKeys(prev => {
          if (prev.includes(taskRef)) return prev;
          return [...prev, taskRef];
        });
      }

      setInHintQuiz(false);
      setLastSubmissionTime(Date.now());
      setShowHintPrompt(false);
    }
  };

  useEffect(() => {
    const checkQuizStatus = async () => {
      if (!selectedTarget || problems.length === 0) return;

      const prob = getProblemForTarget(selectedTarget);
      const taskRef = prob ? prob.key : getTaskRef(selectedTarget.topic_kc_focus);

      if (quizFinishedKeys.includes(taskRef)) {
        return;
      }

      setCheckingQuizStatus(true);
      try {
        const res = await fetch(`/api/exercises?problem_key=${encodeURIComponent(taskRef)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.completed) {
            setQuizFinishedKeys(prev => [...prev, taskRef]);
          } else if (data.in_progress) {
            // Force start the Concept Check quiz only if it is currently in progress
            await handleStartHintQuiz();
          }
        }
      } catch (err) {
        console.error('Failed to fetch quiz status', err);
      } finally {
        setCheckingQuizStatus(false);
      }
    };

    checkQuizStatus();
  }, [selectedTargetId, problems]);

  const handleRetryQuestion = () => {
    setSelectedOption('');
    setShortAnswer('');
    setIsAnswered(false);
    setIsAnswerCorrect(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('amt_solved_homeworks');
      if (saved) {
        try {
          setSolvedTargetIds(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse solved homeworks', e);
        }
      }
    }
  }, []);

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

  // Load starter code when target ID or problems list changes
  useEffect(() => {
    if (selectedTarget && problems.length > 0) {
      const prob = getProblemForTarget(selectedTarget);
      if (prob) {
        setCode(prob.starter_code);
      } else {
        const ref = getTaskRef(selectedTarget.topic_kc_focus);
        setCode(STARTER_CODES[ref] || STARTER_CODES['generic']);
      }
      setEvalResult(null);
      setErrorMessage('');
      setLastSubmissionTime(Date.now());
      setShowHintPrompt(false);
    }
  }, [selectedTargetId, problems]);

  const getProblemForTarget = (target: WeeklyTarget | null): Problem | null => {
    if (!target) return null;
    
    // 1. Try exact key match in DB problems
    let found = problems.find(p => p.key.toLowerCase() === target.topic_kc_focus.toLowerCase());
    if (found) return found;

    // 2. Try matching via getTaskRef fallback
    const ref = getTaskRef(target.topic_kc_focus);
    found = problems.find(p => p.key === ref);
    if (found) return found;

    // 3. Try fuzzy/inclusive match
    found = problems.find(p =>
      p.key.toLowerCase().includes(target.topic_kc_focus.toLowerCase()) ||
      target.topic_kc_focus.toLowerCase().includes(p.key.toLowerCase())
    );
    return found || null;
  };

  const handleStartHomework = (target: WeeklyTarget) => {
    router.push(`/student/solve/${target.id}`);
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
    setLastSubmissionTime(Date.now());
    setShowHintPrompt(false);

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
          lang: descLang,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }

      setEvalResult(data);

      if (data.success && data.passed) {
        setSolvedTargetIds(prev => {
          const updated = [...prev];
          if (!updated.includes(selectedTarget.id)) {
            updated.push(selectedTarget.id);
            localStorage.setItem('amt_solved_homeworks', JSON.stringify(updated));
          }
          return updated;
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to submit attempt. Please make sure the backend is active.');
    } finally {
      setSubmitting(false);
    }
  };

  const isTargetUnlocked = (index: number): boolean => {
    if (index === 0) return true;
    const prevTarget = targets[index - 1];
    return solvedTargetIds.includes(prevTarget.id);
  };

  const isTargetCompleted = (target: WeeklyTarget): boolean => {
    return solvedTargetIds.includes(target.id);
  };

  const completionCount = targets.filter(isTargetCompleted).length;
  const isAllCompleted = targets.length > 0 && completionCount === targets.length;

  if (view === 'list') {
    return (
      <div className="space-y-8 max-w-6xl">
        <div className="rounded-2xl border border-teal-150 bg-gradient-to-r from-teal-50/70 to-emerald-50/70 p-6 shadow-xs">
          <div className="flex items-start space-x-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl tracking-tight">
                My Homework Assignments
              </h1>
              <p className="mt-1 text-xs text-slate-650 leading-relaxed max-w-2xl">
                Solve coding exercises progressively to build your algorithm design skills.
                Assignments must be solved in order. Complete each assignment to unlock the next week.
              </p>
            </div>
          </div>

          {targets.length > 0 && (
            <div className="mt-6 border-t border-teal-100/50 pt-5">
              <div className="flex items-center justify-between text-xs font-bold text-teal-900 mb-2">
                <span>PROGRESS REPORT</span>
                <span>{completionCount} / {targets.length} Homework Completed</span>
              </div>
              <div className="w-full bg-slate-200/60 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${(completionCount / targets.length) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {isAllCompleted && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-6 flex items-center space-x-4 shadow-sm animate-pulse">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 border border-amber-200">
              <Sparkles className="h-5.5 w-5.5 fill-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-amber-900">Congratulations!</h3>
              <p className="text-xs text-amber-700 mt-0.5">You have solved all available homework assignments in this course!</p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Course Schedule</h2>

          {targets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-semibold">No homeworks published yet.</p>
              <p className="text-xs text-slate-400 mt-1">Please ask the instructor to seed or tie targets.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {targets.map((target, idx) => {
                const unlocked = isTargetUnlocked(idx);
                const completed = isTargetCompleted(target);
                const prob = getProblemForTarget(target);
                const title = target.title || prob?.title || getKcDisplayName(target.topic_kc_focus);
                const probDescription = descLang === 'id' ? prob?.description_id : prob?.description_en;
                const description = probDescription || target.description || target.target_task;
                const deadline = isMounted && target.deadline ? formatDeadline(target.deadline) : getDeadlineForWeek(target.week);

                let cardClass = '';
                if (!unlocked) {
                  cardClass = 'border-slate-150 bg-slate-50/50 opacity-60';
                } else if (completed) {
                  cardClass = 'border-emerald-200 bg-emerald-50/10 shadow-2xs';
                } else {
                  cardClass = 'border-indigo-150 bg-indigo-50/5 hover:border-indigo-300 shadow-xs hover:shadow-md hover:translate-y-[-2px]';
                }

                return (
                  <div
                    key={target.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between transition-all duration-205 ${cardClass}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Homework {target.week}
                        </span>

                        {completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : unlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-150 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            <Unlock className="h-3 w-3" /> Unlocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-slate-800 leading-snug">
                          {title}
                        </h3>
                        <p className="text-[11px] text-slate-450 mt-1 font-semibold">
                          Focus: {getKcDisplayName(target.topic_kc_focus)}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-2">
                          {description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-slate-450 text-[11px] font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Due: {deadline}</span>
                      </div>

                      {unlocked ? (
                        <button
                          onClick={() => handleStartHomework(target)}
                          className={`flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${completed
                            ? 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 text-white hover:shadow-md'
                            }`}
                        >
                          <span>{completed ? 'Review Code' : 'Solve Homework'}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          disabled={true}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-400 border border-slate-150 cursor-not-allowed"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          <span>Locked</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (inHintQuiz) {
    if (quizLoading) {
      return (
        <div className="max-w-2xl mx-auto space-y-6 my-12 text-center p-12 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto animate-pulse"></div>
          <h3 className="text-sm font-extrabold text-slate-800 mt-4">Generating Concept Check Exercises...</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">We are preparing 3 interactive questions powered by LLM to test your understanding of this topic.</p>
        </div>
      );
    }

    const currentQuestion = quizQuestions[quizIndex];
    if (!currentQuestion) return null;

    return (
      <div className="max-w-2xl mx-auto space-y-6 my-4">
        {/* Header */}
        <div className="flex items-center justify-end">
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
            Question {quizIndex + 1} of 3
          </span>
        </div>

        {/* Progress Tracker */}
        <div className="flex items-center space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${i < quizIndex
                ? 'bg-emerald-500'
                : i === quizIndex
                  ? 'bg-indigo-600'
                  : 'bg-slate-200'
                }`}
            />
          ))}
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Concept Check</span>
            <h3 className="text-sm font-extrabold text-slate-900 leading-relaxed">
              {currentQuestion.text}
            </h3>
            {currentQuestion.code && (
              <pre className="p-4 bg-slate-50 rounded-xl text-xs font-mono text-slate-700 overflow-x-auto border border-slate-200 leading-relaxed mt-3">
                {currentQuestion.code}
              </pre>
            )}
          </div>

          {/* Answer Area */}
          <div className="space-y-4 pt-2">
            {currentQuestion.type === 'mc' ? (
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.options?.map((opt: string, idx: number) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isSelected = selectedOption === letter;
                  const showResult = isAnswered;
                  const isCorrectOpt = letter === currentQuestion.answer;

                  let btnClass = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-300';
                  if (showResult) {
                    if (isCorrectOpt) {
                      btnClass = 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-bold';
                    } else if (isSelected) {
                      btnClass = 'border-rose-500 bg-rose-50/50 text-rose-900';
                    } else {
                      btnClass = 'border-slate-100 bg-slate-50/50 text-slate-400 opacity-60 pointer-events-none';
                    }
                  } else if (isSelected) {
                    btnClass = 'border-indigo-600 bg-indigo-50 text-indigo-905 font-bold shadow-xs';
                  }

                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => setSelectedOption(letter)}
                      className={`w-full text-left p-4 rounded-xl border flex items-start space-x-3.5 transition-all text-xs ${btnClass}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-bold border text-[11px] ${showResult && isCorrectOpt
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : showResult && isSelected
                          ? 'bg-rose-500 border-rose-500 text-white'
                          : isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}>
                        {letter}
                      </span>
                      <span className="leading-relaxed pt-0.5">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  disabled={isAnswered}
                  value={shortAnswer}
                  onChange={(e) => setShortAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xs focus:border-indigo-500 focus:outline-hidden font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAnswered && shortAnswer.trim()) {
                      handleCheckAnswer();
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Feedback & Navigation Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="flex-1 pr-4">
              {isAnswered && (
                <div className="flex items-start space-x-2 text-xs">
                  {isAnswerCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h5 className={`font-bold ${isAnswerCorrect ? 'text-emerald-950' : 'text-rose-950'}`}>
                      {isAnswerCorrect ? 'Correct!' : 'Incorrect, try again!'}
                    </h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">{currentQuestion.explanation}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0">
              {!isAnswered ? (
                <button
                  type="button"
                  disabled={currentQuestion.type === 'mc' ? !selectedOption : !shortAnswer.trim()}
                  onClick={handleCheckAnswer}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all hover:shadow-md cursor-pointer"
                >
                  Verify Answer
                </button>
              ) : isAnswerCorrect ? (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all hover:shadow-md cursor-pointer flex items-center gap-1"
                >
                  <span>{quizIndex === 2 ? 'Complete & Start Coding' : 'Next Question'}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRetryQuestion}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs px-6 py-3 rounded-xl transition-all cursor-pointer"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const prob = getProblemForTarget(selectedTarget);
  const title = selectedTarget?.title || prob?.title || getKcDisplayName(selectedTarget?.topic_kc_focus);
  const deadline = selectedTarget
    ? (isMounted && selectedTarget.deadline ? formatDeadline(selectedTarget.deadline) : getDeadlineForWeek(selectedTarget.week))
    : '';

  return (
    <div className="space-y-6 max-w-6xl">
      {showHintPrompt && (
        <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs animate-pulse">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-indigo-900">Stuck or need a concept refresher?</h4>
              <p className="text-[11px] text-indigo-700 mt-0.5">Solve a short interactive exercise to build a deeper understanding.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartHintQuiz}
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer shrink-0"
          >
            <span>(Butuh pemahaman lebih dalam?)</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center space-x-3.5">
          <button
            onClick={() => router.push('/student')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
            title="Go back to list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                Homework {selectedTarget?.week}
              </span>
              <span className="text-[9px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.2 rounded-md">
                Due: {deadline}
              </span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-snug">
              {title}
            </h1>
          </div>
        </div>

        {selectedTarget && isTargetCompleted(selectedTarget) && (
          <div className="self-start sm:self-center flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full shadow-2xs">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
            <span>Solved & Verified</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Problem Statement</h2>
              <div className="flex bg-slate-105 p-0.5 rounded-lg border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => setDescLang('en')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${
                    descLang === 'en'
                      ? 'bg-white text-slate-800 shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setDescLang('id')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${
                    descLang === 'id'
                      ? 'bg-white text-slate-800 shadow-2xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  ID
                </button>
              </div>
            </div>

            <div>
              <div className="prose prose-sm text-slate-600 text-xs leading-relaxed whitespace-pre-line">
                {(descLang === 'id' ? prob?.description_id : prob?.description_en) || selectedTarget?.description || selectedTarget?.target_task}
              </div>
            </div>

            {prob?.test_cases && prob.test_cases.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-700">Sample Test Cases</h3>
                <div className="space-y-2.5">
                  {prob.test_cases.slice(0, 2).map((tc, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-[11px] space-y-1.5">
                      <div className="text-[10px] text-slate-400 font-sans font-bold">SAMPLE #{idx + 1}</div>
                      <div className="flex justify-between">
                        <div>
                          <span className="text-slate-400 select-none">Input:</span> <span className="text-slate-800 font-semibold">{tc.input.replace(/\n/g, ' ')}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 select-none">Expected:</span> <span className="text-slate-800 font-semibold">{tc.expected.replace(/\n/g, ' ')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-800">
                <Code2 className="h-4.5 w-4.5 text-indigo-600" />
                <span className="text-sm font-bold">Pseudocode Workspace (.dap)</span>
              </div>
              <button
                type="button"
                onClick={resetTemplate}
                className="flex items-center space-x-1 text-slate-400 hover:text-slate-600 transition-colors text-xs font-semibold"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Reset Starter Code</span>
              </button>
            </div>

            <div className="relative bg-slate-900 p-1">
              <DapCodeEditor
                value={code}
                onChange={setCode}
                rows={16}
              />
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">Compiler: DAP compiler (Go build)</span>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 hover:shadow-lg active:scale-[0.98] disabled:scale-100 px-6 py-3 text-xs font-bold text-white transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    <span>Evaluating Submission...</span>
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
                  <div className="flex items-center text-red-700 bg-red-55/10 border border-red-150 px-3 py-1 rounded-full text-xs font-bold gap-1.5 shadow-2xs">
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

              {evalResult.compilation_error && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">Compiler Diagnostic Logs</h4>
                  <pre className="p-4 bg-slate-900 rounded-xl text-xs font-mono text-red-400 overflow-x-auto border border-slate-800 leading-relaxed">
                    {evalResult.compilation_error}
                  </pre>
                </div>
              )}

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
