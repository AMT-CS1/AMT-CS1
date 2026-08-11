'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle, RefreshCw, Pencil, Trash2, Shuffle, Plus, X, FlaskConical, KeyRound, Clock, FileSpreadsheet, BarChart3, ListChecks, Eye, EyeOff, Sparkles } from 'lucide-react';
import { KcInfo, getKcDisplayName } from '@/lib/kc-utils';
import { SkeletonCardGrid } from '@/components/Skeleton';
import XlsxUploadModal from '@/components/homework/XlsxUploadModal';
import HomeworkAnalyticsView from '@/components/homework/HomeworkAnalyticsView';


interface TestCase {
  input: string;
  expected: string;
}

interface Problem {
  id: string;
  key: string;
  title: string;
  description_en: string;
  description_id: string;
  starter_code: string;
  test_cases: TestCase[];
  kc_tags: string;
}

type SelectionMode = 'kc' | 'manual' | 'random';

interface Homework {
  id: string;
  course_ref: string;
  week: number;
  topic_kc_focus: string;
  target_task: string;
  source: string;
  deadline?: string;
  randomize_problems: boolean;
  kind?: 'homework' | 'lab';
  starts_at?: string | null;
  access_password?: string | null;
  selection_mode?: SelectionMode;
  problem_count?: number | null;
  problem_keys?: string[];
  is_published?: boolean;
}

const LAB_DURATION_MINUTES = 100;

const toLocalInputValue = (dateStr: string): string => {
  const dateObj = new Date(dateStr);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function HomeworkManager({ kind = 'homework' }: { kind?: 'homework' | 'lab' }) {
  const isPracticum = kind === 'lab';
  const kindLabel = isPracticum ? 'Checkpoint' : 'Homework';
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [kcList, setKcList] = useState<KcInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [week, setWeek] = useState<number>(1);
  const [courseRef, setCourseRef] = useState('CS1-PYTHON-2026');
  const [selectedKcs, setSelectedKcs] = useState<string[]>([]);
  const [targetTask, setTargetTask] = useState('');
  const [deadline, setDeadline] = useState('');
  const [randomizeProblems, setRandomizeProblems] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [accessPassword, setAccessPassword] = useState('');

  // Problem-set selection (R2) + checkpoint visibility (R5)
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('kc');
  const [problemCount, setProblemCount] = useState<number>(3);
  const [selectedProblemKeys, setSelectedProblemKeys] = useState<string[]>([]);
  const [randomPool, setRandomPool] = useState<'kc' | 'all'>('kc');
  const [problemSearch, setProblemSearch] = useState('');
  // Homework is visible by default; checkpoints start closed until the teacher opens them.
  const [isPublished, setIsPublished] = useState<boolean>(kind !== 'lab');
  
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Drawer and Delete states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // XLSX Upload & Analytics View states
  const [isXlsxModalOpen, setIsXlsxModalOpen] = useState(false);
  const [analyticsTarget, setAnalyticsTarget] = useState<{ id: string; title: string; week: number } | null>(null);


  // Count matching problems for selected KCs
  const matchingProblemCount = problems.filter(p => {
    const pKcs = p.kc_tags.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    return selectedKcs.some(sk => pKcs.includes(sk.toUpperCase()));
  }).length;

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [problemsRes, homeworksRes, kcsRes] = await Promise.all([
        fetch('/api/problems'),
        fetch('/api/targets'),
        fetch('/api/kcs')
      ]);

      if (!problemsRes.ok || !homeworksRes.ok) {
        throw new Error('Failed to load homework configuration data.');
      }

      const problemsData = await problemsRes.json();
      const homeworksData = await homeworksRes.json();
      const kcsData = kcsRes.ok ? await kcsRes.json() : [];

      setProblems(problemsData);
      setKcList(kcsData);
      
      // Keep only targets of this page's kind, sorted by week ascending
      const sortedHomeworks = homeworksData
        .filter((t: Homework) => (t.kind || 'homework') === kind)
        .sort((a: Homework, b: Homework) => a.week - b.week);
      setHomeworks(sortedHomeworks);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading homework details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleKc = (kcId: string) => {
    setSelectedKcs(prev =>
      prev.includes(kcId)
        ? prev.filter(k => k !== kcId)
        : [...prev, kcId]
    );
  };

  const toggleProblemKey = (key: string) => {
    setSelectedProblemKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const filteredProblems = problems.filter(p => {
    if (!problemSearch.trim()) return true;
    const q = problemSearch.trim().toLowerCase();
    return p.title.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.kc_tags.toLowerCase().includes(q);
  });

  const handleStartEdit = (hw: Homework) => {
    setEditingHomework(hw);
    setWeek(hw.week);
    setCourseRef(hw.course_ref);
    setSelectedKcs(hw.topic_kc_focus.split(',').map(k => k.trim()).filter(Boolean));
    setTargetTask(hw.target_task);
    setRandomizeProblems(hw.randomize_problems);
    setAccessPassword(hw.access_password || '');
    setSelectionMode(hw.selection_mode || 'kc');
    setProblemCount(hw.problem_count || 3);
    setSelectedProblemKeys(hw.problem_keys || []);
    setRandomPool('kc');
    setProblemSearch('');
    setIsPublished(hw.is_published !== false);
    try {
      setDeadline(hw.deadline ? toLocalInputValue(hw.deadline) : '');
    } catch (e) {
      console.error('Failed to parse deadline date', e);
      setDeadline('');
    }
    try {
      setStartsAt(hw.starts_at ? toLocalInputValue(hw.starts_at) : '');
    } catch (e) {
      console.error('Failed to parse starts_at date', e);
      setStartsAt('');
    }
    setError('');
    setSubmitSuccess(false);
    setIsDrawerOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingHomework(null);
    setWeek(1);
    setCourseRef('CS1-PYTHON-2026');
    setDeadline('');
    setSelectedKcs([]);
    setTargetTask('');
    setRandomizeProblems(false);
    setStartsAt('');
    setAccessPassword('');
    setSelectionMode('kc');
    setProblemCount(3);
    setSelectedProblemKeys([]);
    setRandomPool('kc');
    setProblemSearch('');
    setIsPublished(kind !== 'lab');
    setError('');
    setSubmitSuccess(false);
    setSubmitting(false);
    setIsDrawerOpen(false);
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/targets?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to delete ${kindLabel.toLowerCase()}.`);
      }
      setConfirmDeleteId(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while deleting the homework.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitSuccess(false);
    setError('');

    if (!courseRef || !week || !targetTask) {
      setError('Course reference, week, and instructions are required.');
      setSubmitting(false);
      return;
    }
    if (selectionMode === 'kc' && selectedKcs.length === 0) {
      setError('Select at least one KC focus area for KC-based selection.');
      setSubmitting(false);
      return;
    }
    if (selectionMode === 'manual' && selectedProblemKeys.length === 0) {
      setError('Pick at least one problem for manual selection.');
      setSubmitting(false);
      return;
    }
    if (selectionMode === 'random' && (!problemCount || problemCount < 1)) {
      setError('Set how many problems to draw for random selection.');
      setSubmitting(false);
      return;
    }

    if (kind === 'lab') {
      if (!startsAt) {
        setError('Checkpoints require a start time.');
        setSubmitting(false);
        return;
      }
      if (!accessPassword.trim()) {
        setError('Checkpoints require an access password to share in class.');
        setSubmitting(false);
        return;
      }
    }

    // Checkpoints default to a 100-minute window when no explicit deadline is set
    let effectiveDeadline = deadline ? new Date(deadline).toISOString() : null;
    if (kind === 'lab' && !effectiveDeadline && startsAt) {
      effectiveDeadline = new Date(new Date(startsAt).getTime() + LAB_DURATION_MINUTES * 60000).toISOString();
    }

    const topicKcFocus = selectedKcs.join(',');

    try {
      const url = editingHomework ? `/api/targets?id=${editingHomework.id}` : '/api/targets';
      const method = editingHomework ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_ref: courseRef,
          week: Number(week),
          topic_kc_focus: topicKcFocus,
          target_task: targetTask,
          source: 'manual',
          deadline: effectiveDeadline,
          randomize_problems: selectionMode === 'random',
          kind,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          access_password: kind === 'lab' && accessPassword.trim() ? accessPassword.trim() : null,
          selection_mode: selectionMode,
          problem_count: problemCount ? Number(problemCount) : null,
          problem_keys: selectionMode === 'manual' ? selectedProblemKeys : [],
          random_pool: randomPool,
          is_published: isPublished,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${editingHomework ? 'update' : 'save'} homework configuration.`);
      }

      setSubmitSuccess(true);
      
      // Brief success visual before closing drawer
      setTimeout(() => {
        handleCancelEdit();
        fetchData();
      }, 800);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || `An error occurred while publishing the ${kindLabel.toLowerCase()}.`);
      setSubmitting(false);
    }
  };

  if (analyticsTarget) {
    return (
      <HomeworkAnalyticsView
        weeklyTargetId={analyticsTarget.id}
        targetTitle={analyticsTarget.title}
        weekNumber={analyticsTarget.week}
        onBack={() => setAnalyticsTarget(null)}
      />
    );
  }

  return (
    <div className="relative">
      {/* List of Configured Homeworks (Full-width) */}
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Current {kindLabel} Schedule ({homeworks.length})
              </h2>
              <p className="text-[10px] text-slate-405 mt-0.5">
                {isPracticum ? 'Scheduled in-class checkpoints per week' : 'Assigned coding homework tasks per week'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsXlsxModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Upload XLSX Workbook</span>
              </button>
              <button 
                onClick={fetchData}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>


          {loading ? (
            <SkeletonCardGrid cards={4} />
          ) : homeworks.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center font-medium">
              {isPracticum ? 'No checkpoints currently scheduled.' : 'No homeworks currently assigned.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {homeworks.map((hw) => (
                <div key={hw.id} className="p-5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/30 transition-all flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-150 text-xs font-bold text-indigo-700 shrink-0">
                          W{hw.week}
                        </span>
                        <div>
                          <span className="font-extrabold text-sm text-slate-800">
                            {getKcDisplayName(hw.topic_kc_focus, kcList) || hw.topic_kc_focus}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">
                            Course: {hw.course_ref}
                          </span>
                          {hw.deadline && (
                            <div className="flex items-center space-x-1.5 text-slate-500 text-[10px] font-medium mt-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-400" />
                              <span>Due: {new Date(hw.deadline).toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}</span>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {hw.kind === 'lab' && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold">
                                <FlaskConical className="h-2.5 w-2.5" /> Checkpoint
                                {hw.starts_at && (
                                  <span className="font-semibold">
                                    · {new Date(hw.starts_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                )}
                              </span>
                            )}
                            {hw.kind === 'lab' && hw.access_password && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full font-bold font-mono">
                                <KeyRound className="h-2.5 w-2.5" /> {hw.access_password}
                              </span>
                            )}
                            {(hw.selection_mode === 'random' || hw.randomize_problems) && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-full font-bold">
                                <Shuffle className="h-2.5 w-2.5" /> Random
                              </span>
                            )}
                            {hw.selection_mode === 'manual' && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded-full font-bold">
                                <ListChecks className="h-2.5 w-2.5" /> Manual
                              </span>
                            )}
                            {hw.topic_kc_focus.split(',').map(kc => (
                              <span key={kc.trim()} className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-full font-bold">
                                {kc.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 shrink-0">
                        {hw.is_published === false ? (
                          <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Visible
                          </span>
                        )}
                        
                        {confirmDeleteId === hw.id ? (
                          <div className="flex items-center space-x-1">
                            <span className="text-[9px] text-rose-600 font-bold mr-1">Delete?</span>
                            <button
                              onClick={() => handleDelete(hw.id)}
                              className="px-2 py-0.5 bg-rose-600 text-white rounded text-[9px] font-bold hover:bg-rose-700 transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[9px] font-bold hover:bg-slate-300 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => handleStartEdit(hw)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-all"
                              title="Edit Assignment"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(hw.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Delete Assignment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 border-t border-slate-100 pt-3 leading-relaxed">
                      {hw.target_task}
                    </p>
                  </div>

                  {/* Card Action Footer: Dedicated Analytics Button */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100/80">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Analytics & Class Reports
                    </span>
                    <button
                      onClick={() => setAnalyticsTarget({ id: hw.id, title: getKcDisplayName(hw.topic_kc_focus, kcList) || hw.topic_kc_focus, week: hw.week })}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all shadow-2xs"
                      title="View Analytics & Heatmap"
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-amber-600" />
                      <span>View Analytics & Heatmap</span>
                    </button>
                  </div>
                </div>

              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button (FAB) at the bottom right */}
      <button
        type="button"
        onClick={() => {
          handleCancelEdit();
          setIsDrawerOpen(true);
        }}
        className="fixed bottom-8 right-8 z-45 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
        title={`Publish New ${kindLabel}`}
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Side Drawer Backdrop */}
      {isDrawerOpen && (
        <div 
          onClick={handleCancelEdit}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity"
        />
      )}

      {/* Side Drawer Panel (Slides from the right) */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-indigo-600">
                {editingHomework ? `Edit ${kindLabel} Assignment` : `Publish New ${kindLabel}`}
              </h2>
              <p className="text-[10px] text-slate-450 mt-0.5 font-medium">
                {editingHomework
                  ? `Modifying assignment for Week ${editingHomework.week} of ${editingHomework.course_ref}`
                  : 'Choose how problems are assigned and set the weekly topic focus.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-650 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 flex items-start space-x-2 text-xs text-red-800">
              <AlertCircle className="h-4.5 w-4.5 flex-shrink-0 mt-0.5 text-red-650" />
              <span>{error}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 flex items-start space-x-2 text-xs text-emerald-800">
              <CheckCircle className="h-4.5 w-4.5 flex-shrink-0 mt-0.5 text-emerald-650" />
              <span>{editingHomework ? `${kindLabel} successfully updated!` : `${kindLabel} successfully published to course schedule!`}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Week Number *</label>
              <input
                type="number"
                min="1"
                max="52"
                placeholder="e.g. 3"
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Course Reference *</label>
              <input
                type="text"
                placeholder="e.g. CS1-PYTHON-2026"
                value={courseRef}
                onChange={(e) => setCourseRef(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                required
              />
            </div>
          </div>

          {isPracticum && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 flex items-start space-x-2">
              <FlaskConical className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <p className="text-[10px] text-slate-600">
                Checkpoints are locked until the start time, require the in-class password, have no concept-check quizzes, and auto-grade at the deadline.
              </p>
            </div>
          )}

          {kind === 'lab' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" /> Session Start *
                </label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-hidden bg-white text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-amber-500" /> Session Password *
                </label>
                <input
                  type="text"
                  placeholder="Share this in class only"
                  value={accessPassword}
                  onChange={(e) => setAccessPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-amber-500 focus:outline-hidden font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-indigo-500" /> Start Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-white text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Deadline (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-white text-slate-800"
                />
              </div>
            </div>
          )}

          {kind === 'lab' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Deadline (defaults to start + {LAB_DURATION_MINUTES} minutes)
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-white text-slate-800"
              />
            </div>
          )}

          {/* KC Focus Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              KC Focus Areas {selectionMode === 'kc' ? '*' : <span className="font-medium text-slate-400">(weekly topic focus)</span>}
              {selectedKcs.length > 0 && (
                <span className="ml-2 text-[10px] text-indigo-600 font-semibold">
                  ({matchingProblemCount} matching problem{matchingProblemCount !== 1 ? 's' : ''})
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {kcList.map((kc) => {
                const isSelected = selectedKcs.includes(kc.id);
                return (
                  <button
                    key={kc.id}
                    type="button"
                    onClick={() => toggleKc(kc.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    {kc.id} — {kc.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Problem Selection Mode (R2) */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 space-y-3">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5 text-indigo-500" /> Problem Selection
            </span>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'kc', label: 'By KC focus', icon: <Sparkles className="h-3.5 w-3.5" /> },
                { id: 'manual', label: 'Pick problems', icon: <ListChecks className="h-3.5 w-3.5" /> },
                { id: 'random', label: 'Random N', icon: <Shuffle className="h-3.5 w-3.5" /> },
              ] as { id: SelectionMode; label: string; icon: React.ReactNode }[]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectionMode(m.id)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-[11px] font-bold transition-all ${
                    selectionMode === m.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>

            {selectionMode === 'kc' && (
              <p className="text-[10px] text-slate-500">
                Students get up to <b>{problemCount || 3}</b> problems whose KC tags overlap the focus areas below
                {selectedKcs.length > 0 && (
                  <> — <b>{matchingProblemCount}</b> currently match</>
                )}.
              </p>
            )}

            {selectionMode !== 'kc' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Number of problems</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={problemCount}
                  onChange={(e) => setProblemCount(Number(e.target.value))}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            )}

            {selectionMode === 'random' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Draw from</label>
                <div className="flex gap-2">
                  {(['kc', 'all'] as const).map((pool) => (
                    <button
                      key={pool}
                      type="button"
                      onClick={() => setRandomPool(pool)}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                        randomPool === pool
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                      }`}
                    >
                      {pool === 'kc' ? 'Matching KC pool' : 'All problems'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  A random set is drawn and frozen when you save (the same set for every student).
                </p>
              </div>
            )}

            {selectionMode === 'manual' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-600">
                    Pick problems ({selectedProblemKeys.length} selected)
                  </label>
                  <input
                    type="text"
                    placeholder="Search…"
                    value={problemSearch}
                    onChange={(e) => setProblemSearch(e.target.value)}
                    className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {filteredProblems.length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-3 text-center">No problems match.</p>
                  ) : (
                    filteredProblems.map((p) => {
                      const checked = selectedProblemKeys.includes(p.key);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProblemKey(p.key)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                            checked ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                            }`}
                          >
                            {checked && <CheckCircle className="h-3 w-3 text-white" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] font-bold text-slate-700 truncate">{p.title}</span>
                            <span className="block text-[9px] text-slate-400 font-mono truncate">{p.key} · {p.kc_tags}</span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Visibility toggle (R5) */}
          <button
            type="button"
            onClick={() => setIsPublished((v) => !v)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
              isPublished ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/50'
            }`}
          >
            <span
              className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </span>
            <span className="flex-1">
              <span className="text-xs font-bold text-slate-700 block">
                {isPublished ? 'Visible to students' : 'Hidden from students'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {isPracticum
                  ? 'Checkpoints stay closed until you turn this on.'
                  : 'Turn off to hide this from students.'}
              </span>
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isPublished ? 'ON' : 'OFF'}
            </span>
          </button>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">{kindLabel} Instructions *</label>
            <textarea
              placeholder="Detailed coding instructions for the student..."
              value={targetTask}
              onChange={(e) => setTargetTask(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
              required
            />
          </div>

          <div className="flex space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex-1 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedKcs.length === 0}
              className="flex-1 flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 hover:shadow-md px-4 py-3 text-xs font-bold text-white transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>{editingHomework ? 'Updating...' : 'Publishing...'}</span>
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  <span>{editingHomework ? 'Update Assignment' : 'Publish Assignment'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* XLSX Import Modal */}
      <XlsxUploadModal
        isOpen={isXlsxModalOpen}
        onClose={() => setIsXlsxModalOpen(false)}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
}

