'use client';

import { useState } from 'react';
import { Award, FileSearch, MessageSquareText } from 'lucide-react';
import MisconceptionReview from '@/components/rater/MisconceptionReview';
import FeedbackReview from '@/components/rater/FeedbackReview';

export default function RaterPage() {
  const [activeTab, setActiveTab] = useState<'misconceptions' | 'feedback'>('misconceptions');

  const tabClass = (active: boolean) =>
    active
      ? 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-pink-50 text-pink-700 border border-pink-100 shadow-2xs'
      : 'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-slate-500 border border-transparent hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer';

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Introduction Banner */}
      <div className="rounded-xl border border-slate-200 bg-slate-100/50 p-6 flex items-start gap-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-600">
          <Award className="h-5.5 w-5.5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Expert Review</h1>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Review student submissions and their automatically detected misconceptions — comparing each
            submission against the reference solution and both ASTs — and judge whether the tutoring
            feedback generated for students was pedagogically helpful.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1.5 shadow-xs w-fit">
        <button type="button" onClick={() => setActiveTab('misconceptions')} className={tabClass(activeTab === 'misconceptions')}>
          <FileSearch className="h-3.5 w-3.5" />
          <span>Misconception Review</span>
        </button>
        <button type="button" onClick={() => setActiveTab('feedback')} className={tabClass(activeTab === 'feedback')}>
          <MessageSquareText className="h-3.5 w-3.5" />
          <span>Feedback Review</span>
        </button>
      </div>

      {activeTab === 'misconceptions' ? <MisconceptionReview /> : <FeedbackReview />}
    </div>
  );
}
