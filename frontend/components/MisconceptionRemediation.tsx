'use client';

import React, { useEffect, useState } from 'react';
import {
  BrainCircuit, CheckCircle2, XCircle, ChevronRight, Loader2, PartyPopper,
} from 'lucide-react';

// Alur remediasi miskonsepsi berurutan (pilihan ganda). Siswa dikasih satu soal MC
// per tag miskonsepsi (urutan sesuai deteksi backend). Jawaban benar -> maju ke tag
// berikutnya; jawaban salah -> ganti soal lain di tag yang sama. Pas semua tag kelar,
// onComplete dipanggil biar siswa balik ngerjain homework-nya.

interface MCQuestion {
  id: string;
  text_en: string;
  text_id: string;
  code?: string | null;
  options_en: string[];
  options_id: string[];
}

interface RemediationStatus {
  active: boolean;
  completed: boolean;
  problem_key: string;
  tags: string[];
  current_index: number;
  total_tags: number;
  current_tag?: string | null;
  current_tag_name?: string | null;
  current_question?: MCQuestion | null;
}

interface SubmitResponse {
  correct: boolean;
  explanation_en?: string | null;
  explanation_id?: string | null;
  status: RemediationStatus;
}

interface Props {
  problemKey: string;
  lang: 'en' | 'id';
  onComplete: () => void;
  onClose: () => void;
}

export default function MisconceptionRemediation({ problemKey, lang, onComplete, onClose }: Props) {
  const [status, setStatus] = useState<RemediationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Feedback for the question just answered (kept on screen until "Continue").
  const [answered, setAnswered] = useState<{ q: MCQuestion; correct: boolean; explanation: string } | null>(null);

  const t = (en: string, id: string) => (lang === 'id' ? id : en);
  const qText = (q: MCQuestion) => (lang === 'id' ? q.text_id : q.text_en);
  const qOptions = (q: MCQuestion) => (lang === 'id' ? q.options_id : q.options_en);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/remediation/status/${encodeURIComponent(problemKey)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load remediation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemKey]);

  const currentQuestion = status?.current_question ?? null;

  const handleSubmit = async () => {
    if (!currentQuestion || selected === null) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/remediation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_key: problemKey,
          question_id: currentQuestion.id,
          answer_index: selected,
          lang,
        }),
      });
      const data: SubmitResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAnswered({
        q: currentQuestion,
        correct: data.correct,
        explanation: (lang === 'id' ? data.explanation_id : data.explanation_en) || '',
      });
      setStatus(data.status);
      setSelected(null);
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    const done = status?.completed;
    setAnswered(null);
    if (done) onComplete();
  };

  const progressBar = status && status.total_tags > 0 && (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[11px] font-semibold text-white/90">
        <span>
          {t('Misconception', 'Miskonsepsi')} {Math.min(status.current_index + 1, status.total_tags)} / {status.total_tags}
          {status.current_tag_name ? ` — ${status.current_tag_name} (${status.current_tag})` : ''}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1">
        {status.tags.map((tag, i) => (
          <div
            key={tag + i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < status.current_index ? 'bg-emerald-300' : i === status.current_index ? 'bg-white' : 'bg-white/30'
            }`}
            title={tag}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5" />
              <h3 className="text-sm font-extrabold tracking-wide">
                {t('Misconception Remediation', 'Remediasi Miskonsepsi')}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-[11px] font-bold text-white/80 hover:text-white underline underline-offset-2"
            >
              {t('Close', 'Tutup')}
            </button>
          </div>
          {progressBar}
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 text-[12px] py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading…', 'Memuat…')}
            </div>
          )}

          {error && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Completion (reached without a pending feedback card, e.g. on resume) */}
          {!loading && status?.completed && !answered && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PartyPopper className="h-8 w-8 text-emerald-500" />
              <p className="text-[13px] font-extrabold text-slate-800">
                {t('All misconceptions cleared!', 'Semua miskonsepsi teratasi!')}
              </p>
              <p className="text-[11px] text-slate-500">
                {t('You can now retry your homework.', 'Kamu sekarang bisa mencoba homework-mu lagi.')}
              </p>
              <button
                onClick={onComplete}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-4 py-2 rounded-lg cursor-pointer"
              >
                {t('Back to homework', 'Kembali ke homework')}
              </button>
            </div>
          )}

          {/* Feedback for the answered question */}
          {!loading && answered && (
            <div className="space-y-3">
              <p className="text-[12px] font-bold text-slate-800 whitespace-pre-line">{qText(answered.q)}</p>
              {answered.q.code && (
                <pre className="p-2.5 bg-slate-900 rounded-lg text-[11px] font-mono text-slate-100 overflow-x-auto whitespace-pre">{answered.q.code}</pre>
              )}
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold border ${
                answered.correct
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                  : 'text-amber-800 bg-amber-50 border-amber-100'
              }`}>
                {answered.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {answered.correct
                  ? t('Correct!', 'Benar!')
                  : t('Not quite — let’s try a different question for this misconception.',
                      'Belum tepat — coba soal lain untuk miskonsepsi ini.')}
              </div>
              {answered.explanation && (
                <p className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 border border-slate-150 rounded-lg px-3 py-2">
                  {answered.explanation}
                </p>
              )}
              <button
                onClick={handleContinue}
                className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 text-white font-bold text-[12px] px-3 py-2.5 rounded-lg transition-all shadow-xs cursor-pointer"
              >
                <span>
                  {status?.completed
                    ? t('Finish', 'Selesai')
                    : answered.correct
                    ? t('Next misconception', 'Miskonsepsi berikutnya')
                    : t('Try another question', 'Coba soal lain')}
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Active question */}
          {!loading && !answered && !status?.completed && currentQuestion && (
            <div className="space-y-3">
              <p className="text-[12px] font-bold text-slate-800 whitespace-pre-line">{qText(currentQuestion)}</p>
              {currentQuestion.code && (
                <pre className="p-2.5 bg-slate-900 rounded-lg text-[11px] font-mono text-slate-100 overflow-x-auto whitespace-pre">{currentQuestion.code}</pre>
              )}
              <div className="space-y-2">
                {qOptions(currentQuestion).map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={`w-full text-left flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[11px] transition-all cursor-pointer ${
                      selected === i
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                      selected === i ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-slate-400'
                    }`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-slate-700 font-medium">{opt}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || selected === null}
                className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-[12px] px-3 py-2.5 rounded-lg transition-all shadow-xs cursor-pointer"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t('Checking…', 'Memeriksa…')}</>
                ) : (
                  <><span>{t('Submit Answer', 'Kirim Jawaban')}</span><ChevronRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          )}

          {!loading && !answered && !status?.completed && !currentQuestion && !error && (
            <div className="text-[11px] text-slate-500 text-center py-6">
              {t('No active remediation.', 'Tidak ada remediasi aktif.')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
