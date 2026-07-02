'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Play, Code2, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, ChevronRight, ArrowLeft,
  Lock, Unlock, Calendar, Award, BookOpen, Clock,
  Shuffle, ThumbsUp, ThumbsDown
} from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import { KcInfo, getKcDisplayName, DEFAULT_STARTER_CODE } from '@/lib/kc-utils';

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
  randomize_problems?: boolean;
}

interface StudentWorkspaceProps {
  initialTargets: WeeklyTarget[];
  selectedTargetId?: string;
}

interface QuizQuestion {
  type: 'mc' | 'sa';
  text_en: string;
  text_id: string;
  code?: string;
  options_en?: string[];
  options_id?: string[];
  answer: string;
  explanation_en: string;
  explanation_id: string;
}

interface Problem {
  id: string;
  key: string;
  title: string;
  description_en: string;
  description_id: string;
  starter_code: string;
  test_cases: any[];
  kc_tags: string;
}

const formatDeadline = (dateStr: string): string => {
  const d = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  };
  const dateFormatted = d.toLocaleDateString('en-US', options);
  const timeFormatted = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${dateFormatted} at ${timeFormatted}`;
};

export default function StudentWorkspace({ initialTargets, selectedTargetId }: StudentWorkspaceProps) {
  const router = useRouter();
  const [targets] = useState<WeeklyTarget[]>(() => {
    return [...(initialTargets || [])].sort((a, b) => a.week - b.week);
  });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [kcList, setKcList] = useState<KcInfo[]>([]);
  const [descLang, setDescLang] = useState<'en' | 'id'>('en');

  // Derived state based on the routing parameters
  const selectedTarget = selectedTargetId
    ? targets.find(t => t.id === selectedTargetId) || null
    : null;
  const view = selectedTarget ? 'editor' : 'list';

  const [solvedTargetIds, setSolvedTargetIds] = useState<string[]>([]);
  const [solvedProblemKeys, setSolvedProblemKeys] = useState<Record<string, string[]>>({});
  const [activeProblemIndex, setActiveProblemIndex] = useState(0);
  const [code, setCode] = useState('');

  // Resizable split between Problem Statement and Pseudocode Workspace (LeetCode-style)
  const DEFAULT_SPLIT = 42; // % width of the problem panel on lg+ screens
  const MIN_SPLIT = 28;
  const MAX_SPLIT = 72;
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // Vertical split inside the right column: editor pane vs results pane
  const DEFAULT_VSPLIT = 58; // % height of the editor pane on lg+ screens
  const MIN_VSPLIT = 30;
  const MAX_VSPLIT = 78;
  const REVEAL_VSPLIT = 45; // after a run, shrink the editor pane to at most this so results are visible
  const [vSplitRatio, setVSplitRatio] = useState(DEFAULT_VSPLIT);
  const [isPaneDragging, setIsPaneDragging] = useState(false);
  const rightColRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Hint / Concept Check Quiz States
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
  const [quizFeedback, setQuizFeedback] = useState<{ id: string; text: string } | null>(null);
  const [quizFeedbackRating, setQuizFeedbackRating] = useState<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('amt_split_ratio');
    if (saved) {
      const v = parseFloat(saved);
      if (!isNaN(v) && v >= MIN_SPLIT && v <= MAX_SPLIT) setSplitRatio(v);
    }
    const savedV = localStorage.getItem('amt_vsplit_ratio');
    if (savedV) {
      const v = parseFloat(savedV);
      if (!isNaN(v) && v >= MIN_VSPLIT && v <= MAX_VSPLIT) setVSplitRatio(v);
    }
  }, []);

  const startPaneDrag = (e: React.MouseEvent | React.TouchEvent, axis: 'x' | 'y') => {
    e.preventDefault();
    const container = axis === 'x' ? splitContainerRef.current : rightColRef.current;
    if (!container) return;
    const setRatio = axis === 'x' ? setSplitRatio : setVSplitRatio;
    const clamp = (v: number) =>
      axis === 'x'
        ? Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, v))
        : Math.min(MAX_VSPLIT, Math.max(MIN_VSPLIT, v));
    const storageKey = axis === 'x' ? 'amt_split_ratio' : 'amt_vsplit_ratio';

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const point = 'touches' in ev ? ev.touches[0] : ev;
      if (!point) return;
      const fraction = axis === 'x'
        ? (point.clientX - rect.left) / rect.width
        : (point.clientY - rect.top) / rect.height;
      setRatio(clamp(fraction * 100));
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsPaneDragging(false);
      setRatio(v => {
        localStorage.setItem(storageKey, String(v));
        return v;
      });
    };

    setIsPaneDragging(true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (view !== 'editor' || inHintQuiz) {
      setShowHintPrompt(false);
    }
  }, [view, inHintQuiz]);

  const getProblemsForTarget = (target: WeeklyTarget | null): Problem[] => {
    if (!target || problems.length === 0) return [];

    // Parse target KCs
    const targetKcs = target.topic_kc_focus.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);

    // Filter problems that have overlapping KCs
    const matching = problems.filter(p => {
      const pKcs = p.kc_tags.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
      return targetKcs.some(tk => pKcs.includes(tk));
    });

    if (matching.length === 0) return [];

    if (target.randomize_problems && matching.length > 3) {
      if (typeof window !== 'undefined') {
        const cacheKey = `amt_assigned_problems_${target.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const cachedKeys = JSON.parse(cached);
            const cachedProbs = cachedKeys.map((k: string) => problems.find(p => p.key === k)).filter(Boolean) as Problem[];
            if (cachedProbs.length === 3) {
              return cachedProbs;
            }
          } catch (e) {
            console.error('Error parsing cached problems', e);
          }
        }

        // Randomly select 3 problems (using random shuffle cached in localStorage)
        const shuffled = [...matching].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);
        localStorage.setItem(cacheKey, JSON.stringify(selected.map(p => p.key)));
        return selected;
      }
    }

    return matching.slice(0, 3);
  };

  const assignedProblems = getProblemsForTarget(selectedTarget);
  const currentProblem = assignedProblems[activeProblemIndex];

  const handleStartHintQuiz = async () => {
    if (!selectedTarget || !currentProblem) return;
    setQuizLoading(true);
    setInHintQuiz(true);
    setQuizIndex(0);
    setSelectedOption('');
    setShortAnswer('');
    setIsAnswered(false);
    setIsAnswerCorrect(false);

    const taskRef = currentProblem.key;
    const title = currentProblem.title;
    const probDescription = descLang === 'id' ? currentProblem.description_id : currentProblem.description_en;
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
    if (!currentQuestion || !currentProblem) return;

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

    if (!correct) {
      // Show the Socratic feedback pre-generated with the quiz question
      // (no extra LLM call), then persist it so it can be rated and logged.
      const questionText = descLang === 'id' ? currentQuestion.text_id : currentQuestion.text_en;
      const explanationText = descLang === 'id' ? currentQuestion.explanation_id : currentQuestion.explanation_en;
      const studentAns = currentQuestion.type === 'mc' ? selectedOption : shortAnswer;
      setQuizFeedback({ id: '', text: explanationText });

      try {
        const feedbackRes = await fetch('/api/exercises', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _action: 'feedback',
            problem_key: currentProblem.key,
            question_text: questionText,
            student_answer: studentAns,
            feedback_text: explanationText,
            lang: descLang
          })
        });

        if (feedbackRes.ok) {
          const data = await feedbackRes.json();
          setQuizFeedback({ id: data.id, text: data.feedback_text });
        }
      } catch (err) {
        console.error('Failed to save quiz feedback:', err);
      }
    }

    // Proactively notify backend of quiz completion if final question is correct
    if (quizIndex === 2 && correct && selectedTarget) {
      const taskRef = currentProblem.key;

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
    setQuizFeedback(null);
    setQuizFeedbackRating(null);
    if (quizIndex < 2) {
      setQuizIndex(prev => prev + 1);
      setSelectedOption('');
      setShortAnswer('');
      setIsAnswered(false);
      setIsAnswerCorrect(false);
    } else {
      // Completed all 3 exercises
      if (selectedTarget && currentProblem) {
        const taskRef = currentProblem.key;
        setQuizFinishedKeys(prev => {
          if (prev.includes(taskRef)) return prev;
          return [...prev, taskRef];
        });
      }

      setInHintQuiz(false);
      setShowHintPrompt(false);
    }
  };

  const handleRateFeedback = async (ratingValue: number) => {
    if (!quizFeedback || !quizFeedback.id) return;
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _action: 'rate',
          feedback_id: quizFeedback.id,
          rating: ratingValue,
        }),
      });
      if (res.ok) {
        setQuizFeedbackRating(ratingValue);
      }
    } catch (err) {
      console.error('Failed to rate quiz feedback:', err);
    }
  };

  useEffect(() => {
    const checkQuizStatus = async () => {
      if (!selectedTarget || problems.length === 0 || !currentProblem) return;

      const taskRef = currentProblem.key;

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
  }, [selectedTargetId, activeProblemIndex, problems]);

  const handleRetryQuestion = () => {
    setSelectedOption('');
    setShortAnswer('');
    setIsAnswered(false);
    setIsAnswerCorrect(false);
    setQuizFeedback(null);
    setQuizFeedbackRating(null);
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

      // Load solved problems per target
      const loaded: Record<string, string[]> = {};
      targets.forEach(t => {
        const val = localStorage.getItem(`amt_solved_problems_${t.id}`);
        if (val) {
          try {
            loaded[t.id] = JSON.parse(val);
          } catch (e) { }
        }
      });
      setSolvedProblemKeys(loaded);
    }
  }, [targets]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [problemsRes, kcsRes] = await Promise.all([
          fetch('/api/problems'),
          fetch('/api/kcs')
        ]);
        if (problemsRes.ok) {
          const data = await problemsRes.json();
          setProblems(data);
        }
        if (kcsRes.ok) {
          const data = await kcsRes.json();
          setKcList(data);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    fetchData();
  }, []);

  // Initialize activeProblemIndex to first unsolved problem on target change
  useEffect(() => {
    if (selectedTarget && problems.length > 0) {
      const assigned = getProblemsForTarget(selectedTarget);
      const targetSolved = solvedProblemKeys[selectedTarget.id] || [];
      const firstUnsolvedIdx = assigned.findIndex(p => !targetSolved.includes(p.key));
      const newIdx = firstUnsolvedIdx !== -1 ? firstUnsolvedIdx : 0;

      setActiveProblemIndex(newIdx);
    }
  }, [selectedTargetId, problems]);

  // Load code when active problem changes
  useEffect(() => {
    if (selectedTarget && problems.length > 0) {
      const assigned = getProblemsForTarget(selectedTarget);
      const activeProb = assigned[activeProblemIndex];
      if (activeProb) {
        setCode(activeProb.starter_code);
      } else {
        setCode(DEFAULT_STARTER_CODE);
      }
      setEvalResult(null);
      setErrorMessage('');
      setShowHintPrompt(false);
    }
  }, [activeProblemIndex, selectedTargetId, problems]);

  const handleStartHomework = async (target: WeeklyTarget) => {
    try {
      await fetch('/api/student-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'click_solve_homework',
          payload: {
            homework_id: target.id,
            topic_kc_focus: target.topic_kc_focus,
            title: target.title,
          },
        }),
      });
    } catch (err) {
      console.error('Failed to log click_solve_homework:', err);
    }
    router.push(`/student/solve/${target.id}`);
  };

  const resetTemplate = () => {
    if (currentProblem) {
      setCode(currentProblem.starter_code);
      setEvalResult(null);
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || !currentProblem) return;

    setSubmitting(true);
    setEvalResult(null);
    setErrorMessage('');
    setShowHintPrompt(false);

    const taskRef = currentProblem.key;

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

      // Wrong submission: immediately offer the hint quiz (Misconception Probe).
      // Also shown when the quiz was completed before — students can retake it.
      if (!(data.success && data.passed)) {
        setShowHintPrompt(true);
      }

      if (data.success && data.passed) {
        const targetId = selectedTarget.id;
        const currentSolved = solvedProblemKeys[targetId] || [];

        if (!currentSolved.includes(taskRef)) {
          const newSolved = [...currentSolved, taskRef];
          const updated = { ...solvedProblemKeys, [targetId]: newSolved };
          setSolvedProblemKeys(updated);
          localStorage.setItem(`amt_solved_problems_${targetId}`, JSON.stringify(newSolved));

          // Check if all are completed
          const assigned = getProblemsForTarget(selectedTarget);
          const allSolved = assigned.every(p => newSolved.includes(p.key));
          if (allSolved) {
            setSolvedTargetIds(prev => {
              const updatedTargets = [...prev];
              if (!updatedTargets.includes(targetId)) {
                updatedTargets.push(targetId);
                localStorage.setItem('amt_solved_homeworks', JSON.stringify(updatedTargets));
              }
              return updatedTargets;
            });
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to submit attempt. Please make sure the backend is active.');
    } finally {
      setSubmitting(false);
      // Slide the results pane up so the verdict and test cases are visible without dragging
      setVSplitRatio(v => Math.min(v, REVEAL_VSPLIT));
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
      <div className="space-y-8 max-w-6xl mx-auto">
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
                const assigned = getProblemsForTarget(target);
                const solvedCount = (solvedProblemKeys[target.id] || []).length;

                const title = target.title || (assigned.length === 1 ? assigned[0].title : '') || getKcDisplayName(target.topic_kc_focus, kcList);
                const description = target.description || target.target_task;
                const deadline = isMounted && target.deadline ? formatDeadline(target.deadline) : `Week ${target.week} deadline`;

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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Homework {target.week}
                          </span>
                          {target.randomize_problems && (
                            <span className="inline-flex items-center gap-1 text-[8px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.2 rounded-full font-bold">
                              <Shuffle className="h-2 w-2" /> Random
                            </span>
                          )}
                        </div>

                        {completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : unlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-150 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            <Unlock className="h-3 w-3" /> Unlocked ({solvedCount}/{assigned.length})
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
                          Focus: {getKcDisplayName(target.topic_kc_focus, kcList)}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-2">
                          {description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-slate-450 text-[11px] font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[150px]">Due: {deadline}</span>
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

    const questionText = descLang === 'id' ? currentQuestion.text_id : currentQuestion.text_en;
    const explanationText = descLang === 'id' ? currentQuestion.explanation_id : currentQuestion.explanation_en;
    const options = descLang === 'id' ? currentQuestion.options_id : currentQuestion.options_en;

    return (
      <div className="max-w-2xl mx-auto space-y-6 my-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex bg-slate-105 p-0.5 rounded-lg border border-slate-250/50">
            <button
              type="button"
              onClick={() => setDescLang('en')}
              className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${descLang === 'en'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-400 hover:text-slate-700'
                }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setDescLang('id')}
              className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${descLang === 'id'
                ? 'bg-white text-slate-800 shadow-2xs'
                : 'text-slate-400 hover:text-slate-700'
                }`}
            >
              ID
            </button>
          </div>
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
              {questionText}
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
                {options?.map((opt: string, idx: number) => {
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

          {/* Socratic LLM Feedback for incorrect answer */}
          {isAnswered && !isAnswerCorrect && (
            <div className="mt-4 p-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/40 to-purple-50/40 space-y-2.5">
              {quizFeedback ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-indigo-900">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-600">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider">Tutor Guidance</span>
                    </div>
                    {/* Thumbs up / down buttons */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleRateFeedback(1)}
                        className={`p-1.5 rounded-lg transition-colors ${quizFeedbackRating === 1 ? 'bg-indigo-105 text-indigo-705 border border-indigo-200' : 'hover:bg-slate-100 text-slate-400 border border-transparent'}`}
                        title="Feedback was helpful"
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRateFeedback(-1)}
                        className={`p-1.5 rounded-lg transition-colors ${quizFeedbackRating === -1 ? 'bg-indigo-105 text-indigo-705 border border-indigo-200' : 'hover:bg-slate-100 text-slate-400 border border-transparent'}`}
                        title="Feedback was not helpful"
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                    {quizFeedback.text}
                  </div>
                </>
              ) : null}
            </div>
          )}

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
                    {/* On incorrect answers the Tutor Guidance box above shows the feedback */}
                    {isAnswerCorrect && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{explanationText}</p>
                    )}
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

  const title = selectedTarget?.title || (assignedProblems.length === 1 ? assignedProblems[0].title : '') || getKcDisplayName(selectedTarget?.topic_kc_focus ?? '', kcList);
  const deadline = selectedTarget && isMounted && selectedTarget.deadline ? formatDeadline(selectedTarget.deadline) : 'No deadline';
  const hasResultsContent = Boolean(evalResult || errorMessage || showHintPrompt);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-6rem)]">{/* 6rem = shell header (4rem) + main padding (1rem top + 1rem bottom) */}
      {/* Compact Header: back button, title, problems stepper, and progress in one bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            onClick={() => router.push('/student')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
            title="Go back to list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">
                Homework {selectedTarget?.week}
              </span>
              <span className="hidden sm:inline-block text-[8px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.2 rounded-md">
                Due: {deadline}
              </span>
              {selectedTarget && isTargetCompleted(selectedTarget) && (
                <span className="flex items-center gap-1 text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                  <span>Solved</span>
                </span>
              )}
            </div>
            <h1 className="text-xs font-bold text-slate-900 leading-snug truncate">
              {title}
            </h1>
          </div>
        </div>

        <div className="hidden sm:block h-7 w-px bg-slate-200" />

        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {assignedProblems.map((prob, idx) => {
            const targetSolved = solvedProblemKeys[selectedTarget?.id ?? ''] || [];
            const isSolved = targetSolved.includes(prob.key);
            const isActive = idx === activeProblemIndex;
            const isUnlocked = idx === 0 || assignedProblems.slice(0, idx).every(p => targetSolved.includes(p.key));

            return (
              <button
                key={prob.id}
                type="button"
                disabled={!isUnlocked}
                onClick={() => setActiveProblemIndex(idx)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1.5 ${isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm cursor-default'
                  : !isUnlocked
                    ? 'bg-slate-50 text-slate-400 border-slate-150 cursor-not-allowed opacity-60'
                    : isSolved
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/50'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-350'
                  }`}
              >
                {!isUnlocked && <Lock className="h-3 w-3 text-slate-400" />}
                {isSolved && <CheckCircle2 className="h-3 w-3 text-emerald-650" />}
                <span>{idx + 1}. {prob.title}</span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-bold text-slate-500 ml-auto shrink-0">
          {(solvedProblemKeys[selectedTarget?.id ?? ''] || []).length} / {assignedProblems.length} Solved
        </div>
      </div>

      {/* Resizable Split: Problem Statement | Pseudocode Workspace (drag the divider) */}
      <div ref={splitContainerRef} className="flex flex-col lg:flex-row items-stretch gap-4 lg:gap-1 flex-1 min-h-0">
        {/* Problem Statement Panel */}
        <div
          className="min-w-0 w-full lg:w-[var(--split-w)] lg:shrink-0"
          style={{ '--split-w': `${splitRatio}%` } as React.CSSProperties}
        >
          <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4 lg:overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Problem Statement</h2>
              <div className="flex bg-slate-105 p-0.5 rounded-lg border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => setDescLang('en')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${descLang === 'en'
                    ? 'bg-white text-slate-800 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setDescLang('id')}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${descLang === 'id'
                    ? 'bg-white text-slate-800 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                  ID
                </button>
              </div>
            </div>

            <div>
              <div className="prose prose-sm text-slate-600 text-[11px] leading-relaxed whitespace-pre-line">
                {(descLang === 'id' ? currentProblem?.description_id : currentProblem?.description_en) || selectedTarget?.description || selectedTarget?.target_task}
              </div>
            </div>

            {currentProblem?.test_cases && currentProblem.test_cases.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2.5">
                <h3 className="text-[11px] font-bold text-slate-700">Sample Test Cases</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentProblem.test_cases.slice(0, 2).map((tc, idx) => (
                    <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono text-[10px] space-y-1">
                      <div className="text-[9px] text-slate-400 font-sans font-bold">SAMPLE #{idx + 1}</div>
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

        {/* Drag Handle (LeetCode-style resizer) */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize — double-click to reset"
          onMouseDown={(e) => startPaneDrag(e, 'x')}
          onTouchStart={(e) => startPaneDrag(e, 'x')}
          onDoubleClick={() => setSplitRatio(DEFAULT_SPLIT)}
          className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center group"
        >
          <div className="h-14 w-1 rounded-full bg-slate-300 transition-all duration-200 group-hover:h-24 group-hover:bg-indigo-500 group-active:h-24 group-active:bg-indigo-600" />
        </div>

        {/* Right Column: Pseudocode Workspace over the results pane (drag the row divider) */}
        <div ref={rightColRef} className="min-w-0 w-full lg:flex-1 flex flex-col gap-4 lg:gap-0 min-h-0">
          {/* Editor Pane */}
          <div
            className={`flex flex-col min-h-0 lg:h-[var(--v-split)] lg:shrink-0 ${isPaneDragging ? '' : 'lg:transition-[height] lg:duration-500 lg:ease-out'}`}
            style={{ '--v-split': `${vSplitRatio}%` } as React.CSSProperties}
          >
            <form onSubmit={handleSubmit} className="h-full min-h-0 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
              <div className="px-3 sm:px-4 py-2 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-slate-800 min-w-0">
                  <Code2 className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold truncate">Pseudocode Workspace (.dap)</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={resetTemplate}
                    className="flex items-center space-x-1 text-slate-400 hover:text-slate-600 transition-colors text-[11px] font-semibold"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span className="hidden sm:inline">Reset Starter Code</span>
                    <span className="sm:hidden">Reset</span>
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center justify-center space-x-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 hover:shadow-md active:scale-[0.98] disabled:scale-100 px-3.5 py-1.5 text-[11px] font-bold text-white transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        <span>Evaluating...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-white" />
                        <span>Run & Verify Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="relative bg-slate-900 p-1 flex-1 min-h-0">
                <DapCodeEditor
                  value={code}
                  onChange={setCode}
                  rows={16}
                  fillHeight
                />
              </div>
            </form>
          </div>

          {/* Row Drag Handle (resize editor vs results) */}
          <div
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize — double-click to reset"
            onMouseDown={(e) => startPaneDrag(e, 'y')}
            onTouchStart={(e) => startPaneDrag(e, 'y')}
            onDoubleClick={() => setVSplitRatio(DEFAULT_VSPLIT)}
            className="hidden lg:flex h-2 shrink-0 cursor-row-resize items-center justify-center group"
          >
            <div className="w-14 h-1 rounded-full bg-slate-300 transition-all duration-200 group-hover:w-24 group-hover:bg-indigo-500 group-active:w-24 group-active:bg-indigo-600" />
          </div>

          {/* Results Pane: white panel (LeetCode-style) holding error, hint prompt, and verification result */}
          <div className={`flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm lg:overflow-y-auto p-4 space-y-3 ${hasResultsContent ? '' : 'hidden lg:block'}`}>
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-3 text-[11px] text-red-800 flex items-start space-x-2.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {evalResult && (
              <div className="animate-slide-up-fade space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-800">Verification Result</h3>

                  {evalResult.success && evalResult.passed ? (
                    <div className="flex items-center text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold gap-1.5 shadow-2xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Passed All Test Cases!</span>
                    </div>
                  ) : !evalResult.success ? (
                    <div className="flex items-center text-red-700 bg-red-55/10 border border-red-150 px-2.5 py-0.5 rounded-full text-[10px] font-bold gap-1.5 shadow-2xs">
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                      <span>Compilation Error</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold gap-1.5 shadow-2xs">
                      <XCircle className="h-3.5 w-3.5 text-amber-500" />
                      <span>Failed Test Cases</span>
                    </div>
                  )}
                </div>

                {evalResult.success && evalResult.passed && activeProblemIndex < assignedProblems.length - 1 && (
                  <div className="flex justify-end pt-1 border-b border-slate-100 pb-3">
                    <button
                      type="button"
                      onClick={() => setActiveProblemIndex(prev => prev + 1)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-750 transition-all hover:shadow-md cursor-pointer"
                    >
                      <span>Go to Next Problem</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {evalResult.compilation_error && (
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-bold text-slate-700">Compiler Diagnostic Logs</h4>
                    <pre className="p-3 bg-slate-900 rounded-xl text-[11px] font-mono text-red-400 overflow-x-auto border border-slate-800 leading-relaxed">
                      {evalResult.compilation_error}
                    </pre>
                  </div>
                )}

                {/* Logic Hints: misconceptions detected by AST diff against the reference solution */}
                {evalResult.misconceptions && evalResult.misconceptions.length > 0 && (
                  <div className="animate-slide-up-fade rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-800">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <h4 className="text-[11px] font-extrabold uppercase tracking-wider">Logic Hints</h4>
                    </div>
                    <div className="space-y-2">
                      {evalResult.misconceptions.map((m: any, idx: number) => (
                        <div key={idx} className="rounded-lg border border-amber-100 bg-white/70 p-2.5 space-y-1">
                          <div className="text-[11px] font-bold text-slate-800">
                            {m.title}
                            {m.code && m.code !== 'GEN' && (
                              <span className="ml-1.5 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded-full">{m.code}</span>
                            )}
                          </div>
                          {m.description && (
                            <p className="text-[10px] text-slate-600 leading-relaxed">{m.description}</p>
                          )}
                          {m.buggy_expr && (
                            <div className="text-[10px] font-mono text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 overflow-x-auto whitespace-pre">
                              {m.buggy_expr}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hint Quiz (Misconception Probe) prompt — directly above the Verification Result */}
                {showHintPrompt && (
                  <div className="animate-slide-up-fade rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center space-x-2.5">
                      <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600">
                        <Sparkles className="h-4 w-4" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-500" />
                      </div>
                      <div>
                        <h4 className="text-[11px] font-extrabold text-indigo-900">
                          {descLang === 'id' ? 'Butuh pemahaman lebih dalam?' : 'Stuck or need a concept refresher?'}
                        </h4>
                        <p className="text-[10px] text-indigo-700 mt-0.5">
                          {descLang === 'id'
                            ? 'Kerjakan kuis konsep singkat untuk menemukan letak miskonsepsimu sebelum mencoba lagi.'
                            : 'Take a short concept quiz to uncover the misconception before your next attempt.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartHintQuiz}
                      className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 text-white font-bold text-[11px] px-3 py-2 rounded-lg transition-all shadow-xs hover:shadow-md cursor-pointer shrink-0 w-full sm:w-auto"
                    >
                      <span>{descLang === 'id' ? 'Mulai Kuis Konsep' : 'Start Concept Quiz'}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {evalResult.test_results && evalResult.test_results.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-700">Test Case Results</h4>
                    <div className="space-y-2.5">
                      {evalResult.test_results.map((tc: any) => (
                        <div key={tc.test_case_index} className="rounded-xl border border-slate-150 p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-700">Test Case #{tc.test_case_index}</span>
                            {tc.passed ? (
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Pass
                              </span>
                            ) : (
                              <span className="text-red-700 font-bold bg-red-55/10 px-2 py-0.5 rounded-md border border-red-150 flex items-center gap-1 text-[10px]">
                                <XCircle className="h-3 w-3 text-red-500" /> Fail
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-[11px] font-mono">
                            <div className="space-y-1">
                              <span className="text-[9px] text-slate-400 font-sans block font-semibold">Stdin Input</span>
                              <div className="p-2 bg-white border border-slate-200 rounded-md text-slate-700 whitespace-pre">{tc.input || '(empty)'}</div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] text-slate-400 font-sans block font-semibold">Expected Output</span>
                              <div className="p-2 bg-white border border-slate-200 rounded-md text-slate-700 whitespace-pre">{tc.expected}</div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] text-slate-400 font-sans block font-semibold">Actual Output</span>
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

            {/* Empty state: shown before the first run (LeetCode-style) */}
            {!hasResultsContent && (
              <div className="h-full min-h-24 flex items-center justify-center">
                <span className="text-[11px] font-semibold text-slate-400">You must run your code first.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
