'use client';

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ArrowRight, 
  Loader2, 
  Sparkles, 
  Globe, 
  BookOpen, 
  Code2, 
  AlertTriangle,
  Unlock
} from 'lucide-react';
import { MPQuestion, MPSessionStatus, MPSubmitResult } from '@/lib/homework-types';
import { getMPSession, submitMPAnswer } from '@/lib/homework-api';

interface MPQuizModalProps {
  isOpen: boolean;
  weeklyTargetId: string;
  targetTitle: string;
  weekNumber: number;
  onClose: () => void;
  onComplete: () => void;
}

export default function MPQuizModal({
  isOpen,
  weeklyTargetId,
  targetTitle,
  weekNumber,
  onClose,
  onComplete
}: MPQuizModalProps) {
  const [session, setSession] = useState<MPSessionStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  // Quiz interaction state
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [reasoningInput, setReasoningInput] = useState<string>('');
  const [lastResult, setLastResult] = useState<MPSubmitResult | null>(null);

  // Language toggle (EN / ID) - default EN
  const [lang, setLang] = useState<'en' | 'id'>('en');

  useEffect(() => {
    if (isOpen && weeklyTargetId) {
      loadSession();
    }
  }, [isOpen, weeklyTargetId]);

  const loadSession = async () => {
    setLoading(true);
    setError('');
    setLastResult(null);
    setSelectedOption('');
    setReasoningInput('');
    try {
      const sess = await getMPSession(weeklyTargetId);
      setSession(sess);
    } catch (err: any) {
      setError(err.message || 'Failed to load misconception problems session.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (optionLetter: string) => {
    if (lastResult) return; // Locked while feedback is shown
    setSelectedOption(optionLetter);
  };

  const handleSubmit = async () => {
    if (!selectedOption || !session?.current_question) return;

    if (selectedOption === 'D' && !reasoningInput.trim()) {
      setError(lang === 'id' ? 'Mohon tuliskan penjelasan singkat Anda untuk opsi D.' : 'Please type your custom answer or explanation for option D.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await submitMPAnswer({
        weekly_target_id: weeklyTargetId,
        question_id: session.current_question.id,
        selected_option: selectedOption,
        text_input: selectedOption === 'D' ? reasoningInput.trim() : undefined
      });

      setLastResult(res);
      setSession(res.session_status);
    } catch (err: any) {
      setError(err.message || 'Failed to submit answer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    setLastResult(null);
    setSelectedOption('');
    setReasoningInput('');
    setError('');

    if (session?.completed) {
      onComplete();
    }
  };

  if (!isOpen) return null;

  const currentQ = session?.current_question;
  const isCompleted = session?.completed;
  const totalInQueue = session?.tag_queue?.length || 1;
  const currIndex = session?.current_index ?? 0;
  const progressPercent = Math.min(100, Math.round(((currIndex + (lastResult ? 1 : 0)) / totalInQueue) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <BookOpen className="h-5 w-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-400/20 rounded-full border border-emerald-300/30 text-emerald-100 uppercase tracking-wider">
                  Phase 1: MP Package
                </span>
                <span className="text-xs text-emerald-100/80">• Week {weekNumber}</span>
              </div>
              <h2 className="text-lg font-bold tracking-tight text-white">{targetTitle}</h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Language Toggle */}
            <button
              onClick={() => setLang(l => (l === 'id' ? 'en' : 'id'))}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-all border border-white/20"
              title="Switch Language"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {!loading && !isCompleted && (
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm font-medium">Loading Misconception Package...</p>
            </div>
          ) : isCompleted ? (
            /* Celebration Screen when MP is completed */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5 animate-in zoom-in-95">
              <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shadow-inner">
                <Sparkles className="h-10 w-10 animate-bounce" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {lang === 'id' ? 'Paket MP Selesai!' : 'MP Package Completed!'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {lang === 'id'
                    ? 'Selamat! Kamu telah menyelesaikan paket Misconception Problems. Paket Problem Solving (PS) sekarang telah terbuka.'
                    : 'Congratulations! You have completed the Misconception Problems package. The Problem Solving (PS) package is now unlocked.'}
                </p>
              </div>

              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <Unlock className="h-4 w-4" />
                <span>Phase 2 (PS Coding Workspace) Status: UNLOCKED</span>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onComplete();
                }}
                className="mt-4 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>{lang === 'id' ? 'Mulai Problem Solving (PS)' : 'Start Problem Solving (PS)'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : currentQ ? (
            /* Active Question Screen */
            <div className="space-y-5">
              {/* Tag & Counter */}
              <div className="flex items-center justify-between text-xs">
                <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-md font-mono font-bold border border-amber-200 dark:border-amber-800">
                  Tag: {currentQ.misconception_tag}
                </span>
                <span className="font-semibold text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? `Soal ${currIndex + 1} dari ${totalInQueue}` : `Question ${currIndex + 1} of ${totalInQueue}`}
                </span>
              </div>

              {/* Question Text */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <h4 className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                  {lang === 'id' ? currentQ.text_id : currentQ.text_en}
                </h4>
              </div>

              {/* Code Snippet if present */}
              {currentQ.code && (
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 font-mono text-xs p-4 space-y-2 shadow-inner">
                  <div className="flex items-center space-x-2 text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                    <Code2 className="h-3.5 w-3.5" />
                    <span>DAP Pseudocode Snippet</span>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {currentQ.code}
                  </pre>
                </div>
              )}

              {/* Error Message if any */}
              {error && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center space-x-2 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Multiple Choice Options */}
              <div className="space-y-3 pt-2">
                {(() => {
                  const opts = lang === 'id' ? currentQ.options_id : currentQ.options_en;
                  const optionLetters = ['A', 'B', 'C'];
                  return optionLetters.map((letter, i) => {
                    const optText = opts[i] || `Option ${letter}`;
                    const isSelected = selectedOption === letter;

                    let optionStyle = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-emerald-400';
                    if (isSelected) {
                      optionStyle = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500';
                    }

                    if (lastResult) {
                      if (i === lastResult.correct_answer_index) {
                        optionStyle = 'bg-emerald-100 dark:bg-emerald-950/80 border-emerald-600 text-emerald-950 dark:text-emerald-100 font-semibold';
                      } else if (isSelected && !lastResult.correct) {
                        optionStyle = 'bg-rose-100 dark:bg-rose-950/80 border-rose-600 text-rose-950 dark:text-rose-100';
                      }
                    }


                    return (
                      <button
                        key={letter}
                        disabled={!!lastResult}
                        onClick={() => handleOptionSelect(letter)}
                        className={`w-full p-4 rounded-xl border text-left transition-all flex items-start space-x-3 text-sm ${optionStyle}`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {letter}
                        </span>
                        <span className="flex-1 pt-1 leading-normal">{optText}</span>
                      </button>
                    );
                  });
                })()}

                {/* Option D: Other / Custom Answer */}
                {(() => {
                  const isSelected = selectedOption === 'D';
                  return (
                    <div className="space-y-3">
                      <button
                        disabled={!!lastResult}
                        onClick={() => handleOptionSelect('D')}
                        className={`w-full p-4 rounded-xl border text-left transition-all flex items-start space-x-3 text-sm ${
                          isSelected
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-950 dark:text-amber-100 ring-1 ring-amber-500'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected 
                            ? 'bg-amber-600 text-white' 
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          D
                        </span>
                        <div className="flex-1 pt-0.5">
                          <span className="font-semibold block text-slate-900 dark:text-white">
                            {lang === 'id' ? 'D. Lainnya / Jawaban Sendiri' : 'D. Other / Custom Answer'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                            {lang === 'id'
                              ? 'Pilih ini untuk memasukkan jawaban atau penjelasan Anda sendiri dalam bentuk teks.'
                              : 'Select this to type your own custom answer or explanation.'}
                          </span>
                        </div>
                      </button>

                      {/* Text Input for Option D reasoning */}
                      {isSelected && !lastResult && (
                        <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2 animate-in fade-in">
                          <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {lang === 'id'
                              ? 'Tuliskan jawaban atau penjelasan Anda sendiri:'
                              : 'Type your custom answer or explanation:'}
                          </label>
                          <textarea
                            rows={3}
                            value={reasoningInput}
                            onChange={(e) => setReasoningInput(e.target.value)}
                            placeholder={lang === 'id' ? 'Ketik jawaban atau alasan Anda di sini...' : 'Type your custom answer or reason here...'}
                            className="w-full p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Feedback Result Banner */}
              {lastResult && (
                <div className={`p-4 rounded-xl border space-y-2 animate-in fade-in ${
                  lastResult.correct
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
                    : selectedOption === 'D'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                }`}>
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    {lastResult.correct ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span>{lang === 'id' ? 'Jawaban Benar!' : 'Correct Answer!'}</span>
                      </>
                    ) : selectedOption === 'D' ? (
                      <>
                        <HelpCircle className="h-5 w-5 text-amber-600 shrink-0" />
                        <span>{lang === 'id' ? 'Catatan Diterima' : 'Feedback Recorded'}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                        <span>{lang === 'id' ? 'Jawaban Belum Tepat' : 'Incorrect Answer'}</span>
                      </>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                    {lang === 'id' ? lastResult.explanation_id : lastResult.explanation_en}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        {!loading && !isCompleted && currentQ && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
            {lastResult ? (
              <button
                onClick={handleNextQuestion}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all"
              >
                <span>
                  {session?.completed 
                    ? (lang === 'id' ? 'Selesaikan Paket MP' : 'Finish MP Package') 
                    : (lang === 'id' ? 'Lanjut Soal Berikutnya' : 'Next Question')}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!selectedOption || submitting}
                className={`px-6 py-2.5 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all ${
                  !selectedOption || submitting
                    ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>{lang === 'id' ? 'Kirim Jawaban' : 'Submit Answer'}</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
