'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Play, Code2, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, ChevronRight, ArrowLeft,
  Lock, Unlock, Calendar, Award, BookOpen, Clock,
  Shuffle, ThumbsUp, ThumbsDown, FlaskConical, KeyRound,
  Mic, Square, Send, BrainCircuit
} from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import ProblemMarkdown from '@/components/ProblemMarkdown';
import { Skeleton } from '@/components/Skeleton';
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
  kind?: 'homework' | 'lab';
  starts_at?: string | null;
  requires_password?: boolean;
}

interface TargetGrade {
  target_id: string;
  kind: string;
  total_problems: number;
  solved_problems: number;
  grade: number;
  solved_keys: string[];
  problem_reviews?: {
    problem_key: string;
    problem_title: string;
    last_submitted_at: string | null;
    student_code: string | null;
    reference_code: string | null;
    misconceptions: any[];
  }[];
}

interface StudentWorkspaceProps {
  initialTargets: WeeklyTarget[];
  selectedTargetId?: string;
  mode?: 'homework' | 'lab';
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

const formatCountdown = (ms: number): string => {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

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

const formatShortDate = (d: Date): string =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const formatTimeOnly = (d: Date): string =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

export default function StudentWorkspace({ initialTargets, selectedTargetId, mode = 'homework' }: StudentWorkspaceProps) {
  const router = useRouter();
  const basePath = mode === 'lab' ? '/student/practicum' : '/student';
  const [targets] = useState<WeeklyTarget[]>(() => {
    return [...(initialTargets || [])]
      .filter(t => (t.kind || 'homework') === mode)
      .sort((a, b) => a.week - b.week);
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

  // Understanding Confirmation States (shown after a correct probe answer)
  const [inConfirmation, setInConfirmation] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmQuestion, setConfirmQuestion] = useState<{ en: string; id: string } | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmJudging, setConfirmJudging] = useState(false);
  const [confirmResult, setConfirmResult] = useState<
    { score: number; passed: boolean; threshold: number; feedback_en: string; feedback_id: string } | null
  >(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Time-window (lab locks, deadlines) and automated-grade states
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [grades, setGrades] = useState<Record<string, TargetGrade>>({});
  const [labUnlocked, setLabUnlocked] = useState(false);
  const [labPasswordInput, setLabPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const hasStarted = (t: WeeklyTarget) => !t.starts_at || nowTick >= new Date(t.starts_at).getTime();
  const isEnded = (t: WeeklyTarget) => !!t.deadline && nowTick >= new Date(t.deadline).getTime();

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch automated grades for targets whose deadline has passed
  const endedTargetIds = targets.filter(isEnded).map(t => t.id).join(',');
  useEffect(() => {
    targets.filter(isEnded).forEach(t => {
      setGrades(prev => {
        if (prev[t.id]) return prev;
        fetch(`/api/targets/grade?target_id=${t.id}`)
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data) setGrades(g => ({ ...g, [t.id]: data }));
          })
          .catch(err => console.error('Failed to fetch grade', err));
        return prev;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endedTargetIds]);

  // Restore lab unlock from this browser session
  useEffect(() => {
    if (mode === 'lab' && selectedTargetId && typeof window !== 'undefined') {
      setLabUnlocked(!!sessionStorage.getItem(`amt_lab_pw_${selectedTargetId}`));
      setLabPasswordInput('');
      setUnlockError('');
    }
  }, [mode, selectedTargetId]);

  const handleUnlockLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || !labPasswordInput.trim()) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await fetch('/api/targets/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: selectedTarget.id, password: labPasswordInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unlock the practicum session.');
      }
      sessionStorage.setItem(`amt_lab_pw_${selectedTarget.id}`, labPasswordInput.trim());
      setLabUnlocked(true);
    } catch (err: any) {
      setUnlockError(err.message || 'Invalid password.');
    } finally {
      setUnlocking(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    // Detect browser speech-to-text support for the optional microphone input.
    if (typeof window !== 'undefined') {
      setSpeechSupported(
        !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      );
    }
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

    // A correct answer no longer advances immediately: we first ask the student
    // to justify their reasoning and verify genuine understanding via the LLM.
    if (correct) {
      const optList = descLang === 'id' ? currentQuestion.options_id : currentQuestion.options_en;
      const studentAnsText = currentQuestion.type === 'mc'
        ? (optList?.[selectedOption.charCodeAt(0) - 65] ?? selectedOption)
        : shortAnswer;
      await startConfirmation(currentQuestion, studentAnsText);
    }
  };

  // Kick off the reflective "why/how" confirmation step for a correct answer.
  const startConfirmation = async (question: QuizQuestion, studentAnsText: string) => {
    if (!currentProblem) return;
    setInConfirmation(true);
    setConfirmLoading(true);
    setConfirmQuestion(null);
    setConfirmResult(null);
    setConfirmInput('');

    const questionText = descLang === 'id' ? question.text_id : question.text_en;
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'confirm_generate',
          problem_key: currentProblem.key,
          kc_focus: selectedTarget?.topic_kc_focus,
          question_text: questionText,
          student_answer: studentAnsText,
          lang: descLang,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate confirmation question');
      const data = await res.json();
      setConfirmQuestion({ en: data.question_en, id: data.question_id || data.question_en });
    } catch (err) {
      console.error('Failed to generate confirmation question:', err);
      setConfirmQuestion({
        en: 'Correct! In your own words, why is that the right answer? Walk me through your reasoning.',
        id: 'Benar! Dengan kata-katamu sendiri, mengapa itu jawaban yang tepat? Jelaskan alasanmu.',
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleSubmitConfirmation = async () => {
    const question = quizQuestions[quizIndex];
    if (!confirmQuestion || !currentProblem || !question || !confirmInput.trim()) return;
    stopListening();
    setConfirmJudging(true);

    const questionText = descLang === 'id' ? question.text_id : question.text_en;
    const studentAns = question.type === 'mc' ? selectedOption : shortAnswer;
    const confirmQ = descLang === 'id' ? confirmQuestion.id : confirmQuestion.en;

    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'confirm_judge',
          problem_key: currentProblem.key,
          kc_focus: selectedTarget?.topic_kc_focus,
          question_text: questionText,
          confirm_question: confirmQ,
          student_answer: studentAns,
          student_explanation: confirmInput,
          lang: descLang,
        }),
      });
      if (!res.ok) throw new Error('Failed to judge understanding');
      const data = await res.json();
      setConfirmResult(data);
    } catch (err) {
      console.error('Failed to judge understanding:', err);
      // Degrade gracefully: let the student continue rather than trapping them.
      setConfirmResult({
        score: 0,
        passed: false,
        threshold: 70,
        feedback_en: 'We could not evaluate your explanation right now. Let’s continue to the next question.',
        feedback_id: 'Kami tidak dapat mengevaluasi penjelasanmu saat ini. Mari lanjut ke pertanyaan berikutnya.',
      });
    } finally {
      setConfirmJudging(false);
    }
  };

  const resetConfirmation = () => {
    stopListening();
    setInConfirmation(false);
    setConfirmLoading(false);
    setConfirmQuestion(null);
    setConfirmInput('');
    setConfirmJudging(false);
    setConfirmResult(null);
  };

  // Browser speech-to-text (optional). Client-only, no audio leaves the device
  // until the transcribed text is submitted like a normal typed answer.
  const startListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = descLang === 'id' ? 'id-ID' : 'en-US';
      recognition.interimResults = false;
      // Keep listening across pauses so students can speak a full explanation;
      // they end the recording themselves via the icon.
      recognition.continuous = true;
      recognition.onresult = (event: any) => {
        // Append only the newly finalized segments (from resultIndex onward) so
        // continuous mode doesn't re-add earlier sentences.
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        transcript = transcript.trim();
        if (transcript) {
          setConfirmInput(prev => (prev ? prev.trim() + ' ' : '') + transcript);
        }
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch (err) {
      console.error('Speech recognition failed to start:', err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* no-op */ }
    }
    setIsListening(false);
  };

  // Single mic control that walks through record -> (auto) transcribe -> submit:
  //  - while listening: clicking stops the recording (which finalizes the text)
  //  - once there is transcribed/typed text: the icon becomes a submit action
  //  - otherwise: clicking starts a new recording
  const handleMicButtonClick = () => {
    if (isListening) {
      stopListening();
    } else if (confirmInput.trim()) {
      handleSubmitConfirmation();
    } else {
      startListening();
    }
  };

  const finishQuiz = async () => {
    if (selectedTarget && currentProblem) {
      const taskRef = currentProblem.key;
      try {
        await fetch('/api/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _action: 'complete',
            problem_key: taskRef,
            questions_answered: 3,
          }),
        });
      } catch (e) {
        console.error('Failed to notify backend of quiz completion', e);
      }
      setQuizFinishedKeys(prev => (prev.includes(taskRef) ? prev : [...prev, taskRef]));
    }
    resetConfirmation();
    setInHintQuiz(false);
    setShowHintPrompt(false);
  };

  const handleNextQuestion = () => {
    setQuizFeedback(null);
    setQuizFeedbackRating(null);
    resetConfirmation();
    if (quizIndex < 2) {
      // Advance to the next probe, whether the previous one was answered
      // correctly (and confirmed) or incorrectly.
      setQuizIndex(prev => prev + 1);
      setSelectedOption('');
      setShortAnswer('');
      setIsAnswered(false);
      setIsAnswerCorrect(false);
    } else {
      // Reached the final probe: mark the quiz complete and return to coding.
      finishQuiz();
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
      // Practicums (kind 'lab') have no misconception probes / concept-check quizzes
      if (mode === 'lab') return;
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
    router.push(`${basePath}/solve/${target.id}`);
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
          target_id: selectedTarget.id,
          lab_password: mode === 'lab'
            ? sessionStorage.getItem(`amt_lab_pw_${selectedTarget.id}`)
            : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }

      setEvalResult(data);

      console.log('Submission concept matrix evaluation:', {
        q_matrix: data.q_matrix,
        p_matrix: data.p_matrix,
        matrix_similar: data.matrix_similar,
        data: data
      });

      // Wrong submission: immediately offer the hint quiz (Misconception Probe).
      // Also shown when the quiz was completed before — students can retake it.
      // Practicums are quiz-free: the focus is solely on solving the problems.
      if (mode !== 'lab' && !(data.success && data.passed)) {
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
              {mode === 'lab' ? <FlaskConical className="h-6 w-6" /> : <Award className="h-6 w-6" />}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl tracking-tight">
                {mode === 'lab' ? 'Practicum Sessions' : 'My Homework Assignments'}
              </h1>
              <p className="mt-1 text-xs text-slate-650 leading-relaxed max-w-2xl">
                {mode === 'lab'
                  ? 'In-class practicum sessions. Each practicum unlocks at its start time, requires the password your instructor shares in class, and is graded automatically at the deadline.'
                  : 'Solve coding exercises progressively to build your algorithm design skills. Assignments must be solved in order. Complete each assignment to unlock the next week.'}
              </p>
            </div>
          </div>

          {targets.length > 0 && (
            <div className="mt-6 border-t border-teal-100/50 pt-5">
              <div className="flex items-center justify-between text-xs font-bold text-teal-900 mb-2">
                <span>PROGRESS REPORT</span>
                <span>{completionCount} / {targets.length} {mode === 'lab' ? 'Practicums' : 'Homework'} Completed</span>
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {mode === 'lab' ? 'Practicum Schedule' : 'Course Schedule'}
          </h2>

          {targets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              {mode === 'lab' ? (
                <FlaskConical className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              ) : (
                <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              )}
              <p className="text-sm text-slate-500 font-semibold">
                {mode === 'lab' ? 'No practicum sessions published yet.' : 'No homeworks published yet.'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Please ask the instructor to seed or tie targets.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {targets.map((target, idx) => {
                const ended = isMounted && isEnded(target);
                const timeLocked = isMounted && !hasStarted(target);
                const unlocked = mode === 'lab' ? (!timeLocked && !ended) : (isTargetUnlocked(idx) && !timeLocked);
                const gradeInfo = ended ? grades[target.id] : undefined;
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
                            {mode === 'lab' ? 'Practicum' : 'Homework'} {target.week}
                          </span>
                          {target.randomize_problems && (
                            <span className="inline-flex items-center gap-1 text-[8px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.2 rounded-full font-bold">
                              <Shuffle className="h-2 w-2" /> Random
                            </span>
                          )}
                        </div>

                        {ended ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                            <Clock className="h-3 w-3" /> Ended{gradeInfo ? ` — Grade: ${gradeInfo.grade}` : ''}
                          </span>
                        ) : completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : unlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-150 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                            <Unlock className="h-3 w-3" /> Unlocked ({solvedCount}/{assigned.length})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                            <Lock className="h-3 w-3" /> {timeLocked ? 'Opens Soon' : 'Locked'}
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

                      {/* Lab session schedule: start, end, and duration at a glance */}
                      {mode === 'lab' && target.starts_at && isMounted && (() => {
                        const start = new Date(target.starts_at);
                        const end = target.deadline ? new Date(target.deadline) : null;
                        const sameDay = !!end && start.toDateString() === end.toDateString();
                        const durationMin = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
                        return (
                          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                                <Calendar className="h-3 w-3" />
                                <span>Session Schedule</span>
                              </span>
                              {durationMin !== null && durationMin > 0 && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100/80 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                  {durationMin} min
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg bg-white/70 border border-amber-100 px-2.5 py-1.5">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Starts</span>
                                <span className="block text-[12px] font-extrabold text-slate-800">{formatTimeOnly(start)}</span>
                                <span className="block text-[9px] font-semibold text-slate-500">{formatShortDate(start)}</span>
                              </div>
                              <div className="rounded-lg bg-white/70 border border-amber-100 px-2.5 py-1.5">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Ends</span>
                                <span className="block text-[12px] font-extrabold text-slate-800">{end ? formatTimeOnly(end) : '—'}</span>
                                <span className="block text-[9px] font-semibold text-slate-500">
                                  {end ? (sameDay ? 'Same day' : formatShortDate(end)) : 'No deadline set'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Homework timeline: start, end/due at a glance */}
                      {mode === 'homework' && isMounted && (() => {
                        const start = target.starts_at ? new Date(target.starts_at) : null;
                        const end = target.deadline ? new Date(target.deadline) : null;
                        const sameDay = start && end && start.toDateString() === end.toDateString();
                        return (
                          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-indigo-700">
                                <Calendar className="h-3 w-3" />
                                <span>Assignment Timeline</span>
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg bg-white/70 border border-indigo-100 px-2.5 py-1.5">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Available From</span>
                                <span className="block text-[12px] font-extrabold text-slate-800">{start ? formatTimeOnly(start) : 'Immediately'}</span>
                                <span className="block text-[9px] font-semibold text-slate-500">{start ? formatShortDate(start) : 'Open'}</span>
                              </div>
                              <div className="rounded-lg bg-white/70 border border-indigo-100 px-2.5 py-1.5">
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Due Date</span>
                                <span className="block text-[12px] font-extrabold text-slate-800">{end ? formatTimeOnly(end) : '—'}</span>
                                <span className="block text-[9px] font-semibold text-slate-500">
                                  {end ? (sameDay ? 'Same day' : formatShortDate(end)) : 'No deadline set'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      {mode === 'lab' ? (
                        <div className={`flex items-center space-x-1.5 text-[11px] ${!isMounted || ended
                          ? 'text-slate-450 font-medium'
                          : timeLocked
                            ? 'text-slate-500 font-bold'
                            : 'text-amber-600 font-bold'
                          }`}>
                          <Clock className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[170px] font-mono">
                            {!isMounted
                              ? `Week ${target.week}`
                              : ended
                                ? 'Session ended'
                                : timeLocked && target.starts_at
                                  ? `Opens in ${formatCountdown(new Date(target.starts_at).getTime() - nowTick)}`
                                  : target.deadline
                                    ? `Ends in ${formatCountdown(new Date(target.deadline).getTime() - nowTick)}`
                                    : 'In session'}
                          </span>
                        </div>
                      ) : (
                        <div />
                      )}

                      {ended ? (
                        <button
                          onClick={() => handleStartHomework(target)}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
                        >
                          <Award className="h-3.5 w-3.5" />
                          <span>View Grade</span>
                        </button>
                      ) : unlocked ? (
                        <button
                          onClick={() => handleStartHomework(target)}
                          className={`flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${completed
                            ? 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                            : mode === 'lab'
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-105 text-white hover:shadow-md'
                              : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 text-white hover:shadow-md'
                            }`}
                        >
                          {mode === 'lab' && !completed && <KeyRound className="h-3.5 w-3.5" />}
                          <span>{completed ? 'Review Code' : mode === 'lab' ? 'Enter Practicum' : 'Solve Homework'}</span>
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

        {/* Question Card — hidden once the student answers correctly and moves to the understanding check */}
        {!inConfirmation && (
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
                      {isAnswerCorrect ? 'Correct!' : 'Not quite — let’s keep moving.'}
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
                  onClick={handleNextQuestion}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all hover:shadow-md cursor-pointer flex items-center gap-1"
                >
                  <span>{quizIndex === 2 ? 'Back to Coding' : 'Next Question'}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Understanding Confirmation Card — shown after a correct probe answer to verify genuine understanding */}
        {inConfirmation && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="text-xs font-bold">
                {descLang === 'id' ? 'Jawaban benar — mari pastikan kamu benar-benar paham.' : "Correct answer — let's make sure it really clicked."}
              </span>
            </div>

            {confirmLoading ? (
              <div className="flex items-center gap-3 py-6 text-slate-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                <span className="text-xs font-medium">
                  {descLang === 'id' ? 'Menyiapkan pertanyaan pemahaman singkat…' : 'Preparing a quick understanding check…'}
                </span>
              </div>
            ) : (
              <>
                {/* LLM-generated reflective question */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                    <BrainCircuit className="h-3.5 w-3.5" />
                    {descLang === 'id' ? 'Cek Pemahaman' : 'Understanding Check'}
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 leading-relaxed">
                    {descLang === 'id' ? confirmQuestion?.id : confirmQuestion?.en}
                  </h3>
                </div>

                {!confirmResult ? (
                  /* Explanation input (typed or spoken) */
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        disabled={confirmJudging}
                        rows={4}
                        placeholder={isListening
                          ? (descLang === 'id' ? 'Mendengarkan… ucapkan alasanmu' : 'Listening… speak your reasoning')
                          : (descLang === 'id' ? 'Jelaskan alasanmu dengan kata-katamu sendiri…' : 'Explain your reasoning in your own words…')}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 text-xs focus:border-indigo-500 focus:outline-hidden leading-relaxed resize-none disabled:opacity-60"
                      />
                      {(speechSupported || confirmInput.trim()) && (
                        <button
                          type="button"
                          onClick={handleMicButtonClick}
                          disabled={confirmJudging}
                          title={isListening
                            ? (descLang === 'id' ? 'Hentikan & ubah ke teks' : 'Stop & convert to text')
                            : confirmInput.trim()
                              ? (descLang === 'id' ? 'Kirim jawaban' : 'Submit answer')
                              : (descLang === 'id' ? 'Jawab dengan suara' : 'Answer with your voice')}
                          aria-label={isListening
                            ? 'Stop recording'
                            : confirmInput.trim()
                              ? 'Submit answer'
                              : 'Record answer'}
                          className={`absolute right-2.5 bottom-2.5 flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${isListening
                            ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                            : confirmInput.trim()
                              ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300'
                            }`}
                        >
                          {isListening
                            ? <Square className="h-3.5 w-3.5 fill-current" />
                            : confirmInput.trim()
                              ? <Send className="h-4 w-4" />
                              : <Mic className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[11px] text-slate-400 leading-relaxed">
                        {isListening
                          ? (descLang === 'id' ? 'Mendengarkan… bicara, lalu berhenti untuk mengubah ke teks.' : 'Listening… speak, then it converts to text.')
                          : speechSupported
                            ? (descLang === 'id' ? 'Ketik, atau ketuk mikrofon untuk berbicara — lalu ketuk ikon untuk mengirim.' : 'Type, or tap the mic to speak — then tap the icon to submit.')
                            : (descLang === 'id' ? 'Ketik jawabanmu di bawah.' : 'Type your answer below.')}
                      </span>
                      <button
                        type="button"
                        disabled={!confirmInput.trim() || confirmJudging}
                        onClick={handleSubmitConfirmation}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all hover:shadow-md cursor-pointer flex items-center gap-2 shrink-0"
                      >
                        {confirmJudging ? (
                          <>
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            <span>{descLang === 'id' ? 'Menilai…' : 'Evaluating…'}</span>
                          </>
                        ) : (
                          <span>{descLang === 'id' ? 'Kirim Penjelasan' : 'Submit Explanation'}</span>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Understanding score result */
                  <div className="space-y-4">
                    <div className={`p-4 rounded-xl border ${confirmResult.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold ${confirmResult.passed ? 'text-emerald-800' : 'text-amber-800'}`}>
                          {confirmResult.passed
                            ? (descLang === 'id' ? 'Pemahaman terkonfirmasi' : 'Understanding confirmed')
                            : (descLang === 'id' ? 'Belum sepenuhnya paham' : 'Not quite there yet')}
                        </span>
                        <span className={`text-lg font-extrabold tabular-nums ${confirmResult.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {confirmResult.score}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/70 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${confirmResult.passed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${confirmResult.score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-600 mt-2.5 leading-relaxed">
                        {descLang === 'id' ? confirmResult.feedback_id : confirmResult.feedback_en}
                      </p>
                    </div>
                    {!confirmResult.passed && (
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {descLang === 'id'
                          ? `Penjelasanmu di bawah ${confirmResult.threshold}%, jadi kita lanjut ke ${quizIndex === 2 ? 'sesi coding' : 'pertanyaan berikutnya'}.`
                          : `Your explanation scored below ${confirmResult.threshold}%, so we'll move on to ${quizIndex === 2 ? 'the coding section' : 'the next question'}.`}
                      </p>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className={`${confirmResult.passed ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold text-xs px-6 py-3 rounded-xl transition-all hover:shadow-md cursor-pointer flex items-center gap-1`}
                      >
                        <span>
                          {quizIndex === 2
                            ? (descLang === 'id' ? 'Kembali ke Coding' : 'Back to Coding')
                            : (descLang === 'id' ? 'Pertanyaan Berikutnya' : 'Next Question')}
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Deadline passed: submissions are closed — show the automated grade instead of the editor.
  // isEnded re-evaluates every second, so a student inside the page is switched
  // to the grade view automatically the moment the deadline is reached.
  if (selectedTarget && isMounted && isEnded(selectedTarget)) {
    const gradeInfo = grades[selectedTarget.id];
    const isLab = selectedTarget.kind === 'lab';

    if (isLab) {
      return (
        <div className="max-w-xl mx-auto my-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Practicum Session Ended
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Submissions are closed and your grade has been finalized automatically.
              </p>
            </div>
            {gradeInfo ? (
              <div className="space-y-1">
                <div className="text-5xl font-extrabold text-indigo-600">{gradeInfo.grade}</div>
                <p className="text-[11px] font-bold text-slate-500">
                  {gradeInfo.solved_problems} / {gradeInfo.total_problems} problems solved
                </p>
              </div>
            ) : (
              <div className="space-y-2 flex flex-col items-center">
                <Skeleton className="h-12 w-24" />
                <Skeleton className="h-2.5 w-36" />
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push(basePath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-600 transition-all cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Practicum Sessions</span>
            </button>
          </div>
        </div>
      );
    }

    // Homework Review Dashboard
    return (
      <div className="max-w-5xl mx-auto my-8 space-y-6">
        {/* Header Summary Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 shrink-0">
              <Award className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-slate-900">Homework Review</h2>
              <p className="text-[11px] text-slate-500 max-w-md leading-relaxed">
                Submissions are closed. Review your final grade, submission history, reference solutions, and detected misconceptions.
              </p>
            </div>
          </div>
          {gradeInfo ? (
            <div className="flex items-center gap-5">
              <div className="text-right space-y-0.5">
                <div className="text-3xl font-extrabold text-indigo-600">{gradeInfo.grade}</div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {gradeInfo.solved_problems} / {gradeInfo.total_problems} Solved
                </p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => router.push(basePath)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2.5 text-[11px] font-bold text-slate-600 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Homework List</span>
              </button>
            </div>
          ) : (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
          )}
        </div>

        {/* Detailed reviews for each problem */}
        {gradeInfo && gradeInfo.problem_reviews ? (
          <div className="space-y-6">
            {gradeInfo.problem_reviews.map((review, idx) => {
              const lastSubTime = review.last_submitted_at ? new Date(review.last_submitted_at) : null;
              const hasSubmitted = !!lastSubTime;
              const isSolved = gradeInfo.solved_keys.includes(review.problem_key);

              return (
                <div key={review.problem_key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  {/* Problem Title Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-105 border border-slate-200 text-xs font-bold text-slate-500">
                        {idx + 1}
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-800">{review.problem_title}</h3>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${isSolved
                        ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                        : 'bg-rose-50 border border-rose-100 text-rose-700'
                        }`}>
                        {isSolved ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Solved
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-rose-600" /> Unsolved
                          </>
                        )}
                      </span>
                    </div>
                    {hasSubmitted ? (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Last submission: {formatShortDate(lastSubTime)} at {formatTimeOnly(lastSubTime)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">No submissions made</span>
                    )}
                  </div>

                  {/* Code Views Side-by-Side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Student Submission */}
                    <div className="space-y-1.5 flex flex-col">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Code2 className="h-3.5 w-3.5" />
                        <span>Your Last Attempt</span>
                      </h4>
                      {review.student_code ? (
                        <div className="flex-1 min-h-[250px] relative rounded-xl overflow-hidden border border-slate-200">
                          <DapCodeEditor
                            value={review.student_code}
                            onChange={() => { }}
                            readOnly={true}
                            fillHeight={true}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 flex items-center justify-center text-center text-slate-400 text-xs font-semibold min-h-[250px]">
                          No code submitted for this problem
                        </div>
                      )}
                    </div>

                    {/* Reference Solution */}
                    <div className="space-y-1.5 flex flex-col">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Reference Solution</span>
                      </h4>
                      {review.reference_code ? (
                        <div className="flex-1 min-h-[250px] relative rounded-xl overflow-hidden border border-slate-200">
                          <DapCodeEditor
                            value={review.reference_code}
                            onChange={() => { }}
                            readOnly={true}
                            fillHeight={true}
                          />
                        </div>
                      ) : (
                        <div className="flex-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 flex items-center justify-center text-center text-slate-400 text-xs font-semibold min-h-[250px]">
                          No reference solution available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Misconceptions, if available */}
                  {review.misconceptions && review.misconceptions.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2 mt-4">
                      <div className="flex items-center gap-1.5 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Misconceptions Detected in Last Attempt</span>
                      </div>
                      <div className="space-y-2">
                        {review.misconceptions.map((m: any, mIdx: number) => (
                          <div key={mIdx} className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-1 text-xs">
                            <div className="font-bold text-slate-800">
                              {m.title} {m.code && <span className="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full">{m.code}</span>}
                            </div>
                            {m.description && <p className="text-slate-650 text-[10px] leading-relaxed">{m.description}</p>}
                            {m.buggy_expr && (
                              <pre className="p-2 bg-amber-50 border border-amber-100 rounded-md text-[9px] font-mono text-amber-900 overflow-x-auto whitespace-pre">
                                {m.buggy_expr}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-6 w-6 rounded-lg" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3.5 w-48" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-[250px] w-full rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-[250px] w-full rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Target is locked until the start time has been reached
  if (selectedTarget && isMounted && !hasStarted(selectedTarget)) {
    const msToStart = selectedTarget.starts_at ? new Date(selectedTarget.starts_at).getTime() - nowTick : 0;
    const isLab = mode === 'lab';
    const typeLabel = isLab ? 'Practicum Session' : 'Homework Assignment';
    return (
      <div className="max-w-xl mx-auto my-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">{typeLabel} Locked</h2>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              This {typeLabel.toLowerCase()} opens {selectedTarget.starts_at ? `on ${formatDeadline(selectedTarget.starts_at)}` : 'soon'}.
            </p>
          </div>
          <div className="text-3xl font-extrabold font-mono text-amber-600">{formatCountdown(msToStart)}</div>
          <button
            type="button"
            onClick={() => router.push(basePath)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-600 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isLab ? 'Back to Practicum Sessions' : 'Back to Homework List'}</span>
          </button>
        </div>
      </div>
    );
  }

  // Practicums require the in-class password before the workspace opens
  if (mode === 'lab' && selectedTarget && !labUnlocked) {
    return (
      <div className="max-w-md mx-auto my-8">
        <form onSubmit={handleUnlockLab} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Enter Session Password</h2>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Your instructor shares the password at the start of the practicum session.
            </p>
          </div>
          <input
            type="text"
            autoFocus
            value={labPasswordInput}
            onChange={(e) => setLabPasswordInput(e.target.value)}
            placeholder="Session password"
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-center font-mono focus:border-amber-500 focus:outline-hidden"
          />
          {unlockError && (
            <p className="text-[11px] font-bold text-rose-600">{unlockError}</p>
          )}
          <button
            type="submit"
            disabled={unlocking || !labPasswordInput.trim()}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-105 px-4 py-2.5 text-[11px] font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            {unlocking ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <Unlock className="h-3.5 w-3.5" />
            )}
            <span>Unlock Practicum Session</span>
          </button>
          <button
            type="button"
            onClick={() => router.push(basePath)}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            Back to Practicum Sessions
          </button>
        </form>
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
            onClick={() => router.push(basePath)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
            title="Go back to list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">
                {mode === 'lab' ? 'Practicum' : 'Homework'} {selectedTarget?.week}
              </span>
              <span className="hidden sm:inline-block text-[8px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.2 rounded-md">
                Due: {deadline}
              </span>
              {isMounted && selectedTarget?.deadline && !isEnded(selectedTarget) && (
                <span className={`flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.2 rounded-md ${mode === 'lab'
                  ? 'text-amber-700 bg-amber-50 border border-amber-200'
                  : 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                  }`}>
                  <Clock className="h-2.5 w-2.5 animate-pulse" />
                  <span>{formatCountdown(new Date(selectedTarget.deadline).getTime() - nowTick)}</span>
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
              <ProblemMarkdown
                content={(descLang === 'id' ? currentProblem?.description_id : currentProblem?.description_en) || selectedTarget?.description || selectedTarget?.target_task || ''}
              />
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

            {evalResult && !evalResult.passed && evalResult.success && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-[11px] text-amber-800 flex items-start space-x-2.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-500 mt-0.5" />
                <span>
                  {descLang === 'id'
                    ? `Verifikasi gagal. ${evalResult.test_results.filter((tc: any) => tc.passed).length}/${evalResult.test_results.length} test case yang benar.`
                    : `Verification failed. ${evalResult.test_results.filter((tc: any) => tc.passed).length}/${evalResult.test_results.length} correct.`}
                </span>
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
                            <span className="font-bold text-slate-700 flex items-center gap-2">
                              Test Case #{tc.test_case_index}
                              {tc.hidden && <span className="text-[9px] font-normal text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded-full">Hidden</span>}
                            </span>
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
                              <div className="p-2 bg-white border border-slate-200 rounded-md text-slate-700 whitespace-pre">
                                {tc.hidden ? <span className="italic text-slate-400">Hidden</span> : tc.expected}
                              </div>
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
