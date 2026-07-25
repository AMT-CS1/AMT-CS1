'use client';

import React, { useState, useEffect } from 'react';

import { 
  BarChart3, 
  Users, 
  Flame, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Code, 
  HelpCircle, 
  X, 
  Loader2, 
  Sparkles,
  BookOpen,
  ArrowLeft
} from 'lucide-react';
import { ClassReport, HeatmapData, StudentDrilldown } from '@/lib/homework-types';
import { getClassReport, getHeatmapReport, getStudentDrilldown } from '@/lib/homework-api';

interface HomeworkAnalyticsViewProps {
  weeklyTargetId: string;
  targetTitle: string;
  weekNumber: number;
  onBack: () => void;
}

export default function HomeworkAnalyticsView({
  weeklyTargetId,
  targetTitle,
  weekNumber,
  onBack
}: HomeworkAnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'heatmap'>('summary');
  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected student drilldown modal state
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [drilldownData, setDrilldownData] = useState<StudentDrilldown | null>(null);
  const [loadingDrilldown, setLoadingDrilldown] = useState<boolean>(false);

  useEffect(() => {
    loadAnalytics();
  }, [weeklyTargetId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const [rpt, hm] = await Promise.all([
        getClassReport(weeklyTargetId),
        getHeatmapReport(weeklyTargetId)
      ]);
      setClassReport(rpt);
      setHeatmap(hm);
    } catch (err: any) {
      setError(err.message || 'Failed to load homework analytics report.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrilldown = async (userId: string, username: string) => {
    setSelectedStudentId(userId);
    setSelectedStudentName(username);
    setLoadingDrilldown(true);
    try {
      const data = await getStudentDrilldown(weeklyTargetId, userId);
      setDrilldownData(data);
    } catch (err: any) {
      console.error('Failed to load drilldown:', err);
    } finally {
      setLoadingDrilldown(false);
    }
  };

  const filteredStudents = (classReport?.students || []).filter(s =>
    s.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header Bar - Light cohesive theme matching instructor console */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors text-xs font-bold flex items-center space-x-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center space-x-2 text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
              <span>Week {weekNumber}</span>
              <span>• Analytics & Heatmap</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{targetTitle}</h2>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-2 ${
              activeTab === 'summary'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Class Summary</span>
          </button>
          <button
            onClick={() => setActiveTab('heatmap')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center space-x-2 ${
              activeTab === 'heatmap'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Flame className="h-4 w-4" />
            <span>Misconception Heatmap</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">Loading Homework Analytics...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl text-sm font-semibold">
          {error}
        </div>
      ) : activeTab === 'summary' ? (
        /* Class Summary Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search student name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Total: <strong>{filteredStudents.length}</strong> Students
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Student</th>
                    <th className="p-4">MP Status</th>
                    <th className="p-4">MP Score</th>
                    <th className="p-4">PS Status</th>
                    <th className="p-4">PS Score</th>
                    <th className="p-4">Overall Progress</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                        No student data found.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s) => (
                      <tr key={s.user_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-bold text-slate-900 dark:text-white">
                          {s.username}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                            s.mp_status === 'completed' 
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}>
                            {s.mp_status}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.mp_score !== null && s.mp_score !== undefined ? `${s.mp_score}%` : '-'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${
                            s.ps_status === 'completed' 
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : s.ps_status === 'yellow'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}>
                            {s.ps_status}
                          </span>
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.ps_score !== null && s.ps_score !== undefined ? `${s.ps_score}%` : '-'}
                        </td>
                        <td className="p-4">
                          {s.completed ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Completed</span>
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">In Progress</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleOpenDrilldown(s.user_id, s.username)}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:text-indigo-300 rounded-lg transition-all font-bold text-xs inline-flex items-center space-x-1 border border-indigo-200 dark:border-indigo-800"
                          >
                            <span>Drill Down</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Heatmap Tab */
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl text-xs text-amber-900 dark:text-amber-200 flex items-center space-x-3">
            <Flame className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="font-semibold">
              This heatmap displays the distribution of identified misconceptions across Knowledge Components (KCs) for this week.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(heatmap?.misconceptions || []).length === 0 ? (
              <div className="col-span-full p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs font-medium">
                No misconception data recorded for this week yet.
              </div>
            ) : (
              heatmap?.misconceptions.map((m) => (
                <div
                  key={m.misconception_tag}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono font-bold rounded-lg text-xs border border-amber-200 dark:border-amber-800">
                      Tag: {m.misconception_tag}
                    </span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      {m.student_count} Students Affected
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span>Trigger Frequency</span>
                      <span className="font-bold">{m.triggered_count} / {m.total_attempts} Attempts</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((m.triggered_count / Math.max(1, m.total_attempts)) * 100))}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Student Drill-Down Modal */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header - Light cohesive styling */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Student Activity Drill-Down
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">{selectedStudentName}</h3>
              </div>
              <button
                onClick={() => setSelectedStudentId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {loadingDrilldown ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <p className="text-sm font-medium">Loading student activity timeline...</p>
                </div>
              ) : (
                <>
                  {/* Phase 1: MP Attempts */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                      <HelpCircle className="h-4 w-4 text-indigo-600" />
                      <span>Misconception Problems (MP) Attempt History</span>
                    </h4>
                    {drilldownData?.mp_attempts.length === 0 ? (
                      <p className="text-slate-400 italic">No MP attempts recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {drilldownData?.mp_attempts.map((mp, idx) => (
                          <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 dark:text-white">
                                Tag: {mp.misconception_tag} • Selected Option: <span className="text-indigo-600 dark:text-indigo-400">{mp.selected_option}</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                mp.status === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {mp.status}
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{mp.question_text}</p>
                            {mp.text_input && (
                              <div className="mt-1 p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200">
                                <strong>Option D Explanation:</strong> {mp.text_input}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phase 2: PS Submissions */}
                  <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                      <Code className="h-4 w-4 text-indigo-600" />
                      <span>Problem Solving (PS) Coding Submissions</span>
                    </h4>
                    {drilldownData?.ps_attempts.length === 0 ? (
                      <p className="text-slate-400 italic">No PS coding submissions recorded.</p>
                    ) : (
                      <div className="space-y-3">
                        {drilldownData?.ps_attempts.map((ps, idx) => (
                          <div key={idx} className="p-4 bg-slate-900 text-slate-100 rounded-xl space-y-2 border border-slate-800">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-indigo-400">{ps.problem_title} ({ps.problem_key})</span>
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                ps.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                              }`}>
                                {ps.passed ? 'PASSED' : 'FAILED'}
                              </span>
                            </div>
                            {ps.code && (
                              <pre className="p-3 bg-slate-950 rounded-lg overflow-x-auto font-mono text-[11px] text-slate-300 border border-slate-800">
                                {ps.code}
                              </pre>
                            )}
                            {ps.misconceptions_triggered.length > 0 && (
                              <div className="text-[11px] text-amber-300 font-medium">
                                <strong>Detected Misconceptions:</strong> {ps.misconceptions_triggered.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
