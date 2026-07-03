'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, ChevronRight, ArrowLeft, CheckCircle, XCircle, Code, User, Calendar, BookOpen, Clock, Lock, Unlock } from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import { KcInfo, getKcDisplayName } from '@/lib/kc-utils';
import { Skeleton, SkeletonCardGrid } from '@/components/Skeleton';

interface Homework {
  id: string;
  course_ref: string;
  week: number;
  topic_kc_focus: string;
  target_task: string;
  source: string;
  deadline?: string;
  randomize_problems: boolean;
  title?: string;
  description?: string;
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

interface Attempt {
  id: string;
  user_id: string;
  task_ref: string;
  modality: string;
  content_ref: string;
  source: string;
  timestamp: string;
  confidence_level: number | null;
  passed?: boolean;
}

export default function SubmissionsPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [kcList, setKcList] = useState<KcInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // View state machine: 'homeworks' | 'students' | 'student-detail'
  const [view, setView] = useState<'homeworks' | 'students' | 'student-detail'>('homeworks');
  
  // Selected state
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Attempt code toggle and cache states
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [codeCache, setCodeCache] = useState<Record<string, string>>({});
  const [codeLoadingId, setCodeLoadingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [hwRes, problemsRes, attemptsRes, kcsRes] = await Promise.all([
        fetch('/api/targets'),
        fetch('/api/problems'),
        fetch('/api/attempts'),
        fetch('/api/kcs')
      ]);

      if (!hwRes.ok || !problemsRes.ok || !attemptsRes.ok) {
        throw new Error('Failed to load submissions and target information');
      }

      const hwData = await hwRes.json();
      const problemsData = await problemsRes.json();
      const attemptsData = await attemptsRes.json();
      const kcsData = kcsRes.ok ? await kcsRes.json() : [];

      setHomeworks(hwData.sort((a: Homework, b: Homework) => a.week - b.week));
      setProblems(problemsData);
      setAttempts(attemptsData);
      setKcList(kcsData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while loading submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getProblemsForHomework = (hw: Homework | null): Problem[] => {
    if (!hw || problems.length === 0) return [];
    const targetKcs = hw.topic_kc_focus.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    return problems.filter(p => {
      const pKcs = p.kc_tags.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
      return targetKcs.some(tk => pKcs.includes(tk));
    });
  };

  const handleSelectHomework = (hw: Homework) => {
    setSelectedHomework(hw);
    setView('students');
  };

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setExpandedAttemptId(null);
    setView('student-detail');
  };

  const handleBackToHomeworks = () => {
    setSelectedHomework(null);
    setSelectedStudentId(null);
    setView('homeworks');
  };

  const handleBackToStudents = () => {
    setSelectedStudentId(null);
    setView('students');
  };

  const toggleAttemptCode = async (attemptId: string) => {
    if (expandedAttemptId === attemptId) {
      setExpandedAttemptId(null);
      return;
    }

    setExpandedAttemptId(attemptId);

    if (!codeCache[attemptId]) {
      setCodeLoadingId(attemptId);
      try {
        const res = await fetch(`/api/attempts/${attemptId}/code`);
        if (res.ok) {
          const data = await res.json();
          setCodeCache(prev => ({
            ...prev,
            [attemptId]: data.code || ''
          }));
        }
      } catch (err) {
        console.error('Failed to fetch attempt code:', err);
      } finally {
        setCodeLoadingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-2.5 w-96 max-w-full" />
        </div>
        <SkeletonCardGrid cards={4} />
      </div>
    );
  }

  // Tier 1: Homeworks list view
  if (view === 'homeworks') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 font-sans">Submissions by Homework</h1>
          <p className="text-xs text-slate-500 mt-1">
            Select a weekly homework assignment to view student submissions.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {homeworks.map((hw) => {
            const hwProblems = getProblemsForHomework(hw);
            const probKeys = hwProblems.map(p => p.key);
            
            // Find all unique students who submitted attempts for these problems
            const hwAttempts = attempts.filter(a => probKeys.includes(a.task_ref));
            const uniqueStudents = Array.from(new Set(hwAttempts.map(a => a.user_id)));

            return (
              <div 
                key={hw.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-150 text-xs font-bold text-indigo-700">
                      W{hw.week}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {hw.course_ref}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">
                      {hw.title || getKcDisplayName(hw.topic_kc_focus, kcList)}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                      Focus KCs: {hw.topic_kc_focus}
                    </p>
                    <p className="text-xs text-slate-550 line-clamp-2 mt-2 leading-relaxed">
                      {hw.target_task}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-150 rounded-full px-2.5 py-0.5">
                    {uniqueStudents.length} Student{uniqueStudents.length !== 1 ? 's' : ''} Submitted
                  </span>

                  <button
                    onClick={() => handleSelectHomework(hw)}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-xs"
                  >
                    <span>View Student List</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Tier 2: Students list for active homework
  if (view === 'students' && selectedHomework) {
    const hwProblems = getProblemsForHomework(selectedHomework);
    const probKeys = hwProblems.map(p => p.key);
    
    // Find attempts matching this homework's problems
    const hwAttempts = attempts.filter(a => probKeys.includes(a.task_ref));
    const uniqueStudents = Array.from(new Set(hwAttempts.map(a => a.user_id)));

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToHomeworks}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
            title="Go back to homeworks"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Students for Week {selectedHomework.week} Homework
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Select a student to view their attempts for each problem in this homework.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-800">Submitted Students ({uniqueStudents.length})</h2>
          </div>

          {uniqueStudents.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-slate-500">No submissions yet</p>
              <p className="text-xs text-slate-400 mt-1">Students have not submitted any attempts for this homework's problems.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {uniqueStudents.map((studentId) => {
                const studentHwAttempts = hwAttempts.filter(a => a.user_id === studentId);
                
                // Calculate solved problems count out of total assigned
                const solvedKeys = Array.from(new Set(studentHwAttempts.filter(a => a.passed).map(a => a.task_ref)));
                const scoreBadgeClass = solvedKeys.length === hwProblems.length 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-150' 
                  : 'bg-amber-50 text-amber-700 border-amber-150';

                return (
                  <div 
                    key={studentId}
                    className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 font-mono">{studentId}</span>
                        <span className="block text-[10px] text-slate-450 mt-0.5">
                          {studentHwAttempts.length} total attempt{studentHwAttempts.length !== 1 ? 's' : ''} submitted
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${scoreBadgeClass}`}>
                        {solvedKeys.length} / {hwProblems.length} Problems Solved
                      </span>

                      <button
                        onClick={() => handleSelectStudent(studentId)}
                        className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition-all"
                      >
                        <span>View Work</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
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

  // Tier 3: StudentDetail view for selected student + selected homework
  if (view === 'student-detail' && selectedHomework && selectedStudentId) {
    const hwProblems = getProblemsForHomework(selectedHomework);
    const studentHwAttempts = attempts.filter(a => a.user_id === selectedStudentId && hwProblems.map(p => p.key).includes(a.task_ref));

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToStudents}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all"
            title="Go back to student list"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">
              Student Work Details
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Viewing submissions for student <span className="font-mono text-indigo-700 font-bold">{selectedStudentId.substring(0, 8)}...</span> on Week {selectedHomework.week} Homework.
            </p>
          </div>
        </div>

        {/* List every problem in the homework */}
        <div className="space-y-6">
          {hwProblems.map((prob, idx) => {
            const probAttempts = studentHwAttempts.filter(a => a.task_ref === prob.key);
            
            return (
              <div 
                key={prob.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
              >
                {/* Problem header banner */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-650 uppercase tracking-wider">Problem #{idx + 1}</span>
                    <h3 className="text-sm font-extrabold text-slate-800 mt-0.5">{prob.title}</h3>
                  </div>
                  <code className="text-[10px] font-mono bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    key: {prob.key}
                  </code>
                </div>

                <div className="p-6 space-y-4">
                  {/* Description snippet */}
                  <div className="text-xs text-slate-550 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-line leading-relaxed">
                    {prob.description_en}
                  </div>

                  {/* List submissions for this problem */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-600">Student Attempts:</h4>

                    {probAttempts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No submissions made for this problem yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-150 rounded-xl overflow-hidden">
                        {probAttempts.map((attempt) => {
                          const isAttemptExpanded = expandedAttemptId === attempt.id;
                          const isCodeLoading = codeLoadingId === attempt.id;
                          const codeContent = codeCache[attempt.id] || '';
                          const isPassed = attempt.passed === true;

                          return (
                            <div key={attempt.id} className="p-4 bg-white space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                                <div className="flex items-center gap-3">
                                  {isPassed ? (
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-full px-2 py-0.5 text-[9px] font-bold">
                                      <CheckCircle className="h-3 w-3 text-emerald-600" /> Correct
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-150 rounded-full px-2 py-0.5 text-[9px] font-bold">
                                      <XCircle className="h-3 w-3 text-rose-600" /> Incorrect
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1 text-[10px] text-slate-450 font-semibold">
                                    <Calendar className="h-3 w-3" />
                                    <span>{new Date(attempt.timestamp).toLocaleString()}</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleAttemptCode(attempt.id)}
                                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-700 rounded-lg shadow-2xs transition-all"
                                >
                                  <Code className="h-3.5 w-3.5 text-slate-400" />
                                  <span>{isAttemptExpanded ? 'Hide Code' : 'Show Code'}</span>
                                </button>
                              </div>

                              {isAttemptExpanded && (
                                <div className="border-t border-slate-100 pt-3">
                                  {isCodeLoading ? (
                                    <div className="py-6 flex justify-center items-center">
                                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                                    </div>
                                  ) : (
                                    <DapCodeEditor
                                      value={codeContent}
                                      onChange={() => {}}
                                      readOnly={true}
                                      rows={8}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
