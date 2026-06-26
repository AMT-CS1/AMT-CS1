'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, HelpCircle, CheckCircle, AlertCircle, RefreshCw, Pencil, Trash2 } from 'lucide-react';

interface TestCase {
  input: string;
  expected: string;
}

interface Problem {
  id: string;
  key: string;
  title: string;
  description: string;
  starter_code: string;
  test_cases: TestCase[];
}

interface Homework {
  id: string;
  course_ref: string;
  week: number;
  topic_kc_focus: string;
  target_task: string;
  source: string;
}

export default function HomeworkManager() {
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [week, setWeek] = useState<number>(1);
  const [courseRef, setCourseRef] = useState('CS1-PYTHON-2026');
  const [selectedProblemKey, setSelectedProblemKey] = useState('');
  const [topicKcFocus, setTopicKcFocus] = useState('');
  const [targetTask, setTargetTask] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Edit / Delete states
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [problemsRes, homeworksRes] = await Promise.all([
        fetch('/api/problems'),
        fetch('/api/targets')
      ]);

      if (!problemsRes.ok || !homeworksRes.ok) {
        throw new Error('Failed to load homework configuration data.');
      }

      const problemsData = await problemsRes.json();
      const homeworksData = await homeworksRes.json();

      setProblems(problemsData);
      
      // Sort homeworks by week ascending
      const sortedHomeworks = homeworksData.sort((a: Homework, b: Homework) => a.week - b.week);
      setHomeworks(sortedHomeworks);

      // Pre-select first problem if available and not currently editing/selected
      if (problemsData.length > 0 && !selectedProblemKey && !editingHomework) {
        handleProblemSelect(problemsData[0].key, problemsData);
      }
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

  const handleProblemSelect = (key: string, currentProblems = problems) => {
    setSelectedProblemKey(key);
    const prob = currentProblems.find(p => p.key === key);
    if (prob) {
      setTopicKcFocus(prob.key);
      setTargetTask(prob.description);
    }
  };

  const handleStartEdit = (hw: Homework) => {
    setEditingHomework(hw);
    setWeek(hw.week);
    setCourseRef(hw.course_ref);
    setSelectedProblemKey(hw.topic_kc_focus);
    setTopicKcFocus(hw.topic_kc_focus);
    setTargetTask(hw.target_task);
    setError('');
    setSubmitSuccess(false);
  };

  const handleCancelEdit = () => {
    setEditingHomework(null);
    setWeek(1);
    setCourseRef('CS1-PYTHON-2026');
    if (problems.length > 0) {
      handleProblemSelect(problems[0].key, problems);
    } else {
      setSelectedProblemKey('');
      setTopicKcFocus('');
      setTargetTask('');
    }
    setError('');
    setSubmitSuccess(false);
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/targets?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete homework.');
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

    if (!courseRef || !week || !topicKcFocus || !targetTask) {
      setError('All fields are required.');
      setSubmitting(false);
      return;
    }

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
          source: 'manual'
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${editingHomework ? 'update' : 'save'} homework configuration.`);
      }

      setSubmitSuccess(true);
      if (editingHomework) {
        setEditingHomework(null);
      }
      
      // Clear fields if creating
      if (method === 'POST') {
        setWeek(1);
        if (problems.length > 0) {
          handleProblemSelect(problems[0].key, problems);
        }
      }
      
      // Refresh list
      await fetchData();
      
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while publishing the homework.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
      {/* List of Configured Homeworks */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Current Homework Schedule ({homeworks.length})
              </h2>
              <p className="text-[10px] text-slate-405 mt-0.5">Assigned coding homework tasks per week</p>
            </div>
            <button 
              onClick={fetchData}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
            </div>
          ) : homeworks.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center font-medium">No homeworks currently assigned.</p>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
              {homeworks.map((hw) => {
                // Find matching problem details from loaded problems
                const matchedProblem = problems.find(p => p.key.toLowerCase() === hw.topic_kc_focus.toLowerCase());
                return (
                  <div key={hw.id} className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/30 transition-all space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-150 text-xs font-bold text-indigo-700">
                          W{hw.week}
                        </span>
                        <div>
                          <span className="font-extrabold text-sm text-slate-800">
                            {matchedProblem ? matchedProblem.title : hw.topic_kc_focus}
                          </span>
                          <span className="block text-[9px] text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">
                            Course: {hw.course_ref}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end space-y-1.5">
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                          Published
                        </span>
                        
                        {confirmDeleteId === hw.id ? (
                          <div className="flex items-center space-x-1 mt-1">
                            <span className="text-[9px] text-rose-600 font-bold mr-1">Delete?</span>
                            <button
                              onClick={() => handleDelete(hw.id)}
                              className="px-1.5 py-0.5 bg-rose-600 text-white rounded text-[9px] font-bold hover:bg-rose-700 transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[9px] font-bold hover:bg-slate-350 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleStartEdit(hw)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-all"
                              title="Edit Assignment"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(hw.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                              title="Delete Assignment"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-550 whitespace-pre-line border-t border-slate-100 pt-2 leading-relaxed">
                      {hw.target_task}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Homework Creation/Assignment Form */}
      <div className="lg:col-span-6">
        <form onSubmit={handleSubmit} className={`rounded-xl border ${editingHomework ? 'border-indigo-300 shadow-indigo-50/50 shadow-md' : 'border-slate-200 shadow-sm'} bg-white p-6 space-y-5 transition-all`}>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600">
              {editingHomework ? 'Edit Homework Assignment' : 'Publish & Tie Problem to Homework'}
            </h2>
            <p className="text-[10px] text-slate-450 mt-0.5 font-medium">
              {editingHomework 
                ? `Modifying assignment for Week ${editingHomework.week} of ${editingHomework.course_ref}` 
                : 'Configure a weekly slot and assign a dynamic coding problem to it.'}
            </p>
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
              <span>{editingHomework ? 'Homework successfully updated!' : 'Homework successfully published to course schedule!'}</span>
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

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Select Coding Problem *</label>
            {problems.length === 0 ? (
              <p className="text-xs text-amber-600 font-medium">Please create a coding problem first in the form below.</p>
            ) : (
              <select
                value={selectedProblemKey}
                onChange={(e) => handleProblemSelect(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-white text-slate-800"
                required
              >
                {problems.map((p) => (
                  <option key={p.id} value={p.key}>
                    {p.title} (key: {p.key})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Homework Focus Topic (Auto-filled) *</label>
            <input
              type="text"
              placeholder="e.g. Loops"
              value={topicKcFocus}
              onChange={(e) => setTopicKcFocus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-slate-50 text-slate-600 cursor-not-allowed"
              readOnly
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Homework Instructions (Auto-filled) *</label>
            <textarea
              placeholder="Detailed coding instructions for the student..."
              value={targetTask}
              onChange={(e) => setTargetTask(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden bg-slate-50 text-slate-600"
              required
            />
          </div>

          <div className="flex space-x-3">
            {editingHomework && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="flex-1 rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 transition-all"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || problems.length === 0}
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
    </div>
  );
}
