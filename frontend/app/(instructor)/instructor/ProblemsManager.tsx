'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Code, BookOpen, CheckCircle, AlertCircle, RefreshCw, Pencil } from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';

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

export default function ProblemsManager() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [testCases, setTestCases] = useState<TestCase[]>([{ input: '', expected: '' }]);
  
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Edit / Delete states
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/problems');
      if (!res.ok) {
        throw new Error(`Failed to fetch problems: ${res.status}`);
      }
      const data = await res.json();
      setProblems(data);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load coding problems.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  const handleAddTestCase = () => {
    setTestCases([...testCases, { input: '', expected: '' }]);
  };

  const handleRemoveTestCase = (index: number) => {
    if (testCases.length === 1) return;
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const handleTestCaseChange = (index: number, field: keyof TestCase, value: string) => {
    const updated = [...testCases];
    updated[index][field] = value;
    setTestCases(updated);
  };

  const handleStartEdit = (prob: Problem) => {
    setEditingProblem(prob);
    setKey(prob.key);
    setTitle(prob.title);
    setDescription(prob.description);
    setStarterCode(prob.starter_code);
    setTestCases(prob.test_cases.length > 0 ? prob.test_cases : [{ input: '', expected: '' }]);
    setError('');
    setSubmitSuccess(false);
  };

  const handleCancelEdit = () => {
    setEditingProblem(null);
    setKey('');
    setTitle('');
    setDescription('');
    setStarterCode('');
    setTestCases([{ input: '', expected: '' }]);
    setError('');
    setSubmitSuccess(false);
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/problems?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete problem.');
      }
      setConfirmDeleteId(null);
      await fetchProblems();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while deleting the problem.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitSuccess(false);
    setError('');

    // Basic validation
    if (!key || !title || !description || !starterCode) {
      setError('All fields are required.');
      setSubmitting(false);
      return;
    }

    const hasEmptyTestCase = testCases.some(tc => !tc.input.trim() && !tc.expected.trim());
    if (hasEmptyTestCase) {
      setError('Please fill in or remove empty test cases.');
      setSubmitting(false);
      return;
    }

    try {
      const url = editingProblem ? `/api/problems?id=${editingProblem.id}` : '/api/problems';
      const method = editingProblem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          title,
          description,
          starter_code: starterCode,
          test_cases: testCases,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save problem');
      }

      setSubmitSuccess(true);
      if (editingProblem) {
        setEditingProblem(null);
      }
      
      // Reset form fields
      setKey('');
      setTitle('');
      setDescription('');
      setStarterCode('');
      setTestCases([{ input: '', expected: '' }]);
      
      // Refresh list
      await fetchProblems();
      
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while saving the problem.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
      {/* List of Existing Problems */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Active Coding Exercises ({problems.length})
              </h2>
              <p className="text-[10px] text-slate-405 mt-0.5">Problems currently in PostgreSQL</p>
            </div>
            <button 
              onClick={fetchProblems}
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
          ) : problems.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No coding problems found in database.</p>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
              {problems.map((prob) => (
                <div key={prob.id} className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/30 transition-all space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-extrabold text-sm text-slate-800">{prob.title}</span>
                      <code className="block text-[10px] font-mono text-indigo-650 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 mt-1 max-w-max">
                        key: {prob.key}
                      </code>
                    </div>
                    
                    <div className="flex flex-col items-end space-y-1.5">
                      <span className="text-[10px] bg-slate-150 text-slate-650 px-2 py-0.5 rounded-full font-bold">
                        {prob.test_cases.length} Test Cases
                      </span>

                      {confirmDeleteId === prob.id ? (
                        <div className="flex items-center space-x-1 mt-1">
                          <span className="text-[9px] text-rose-600 font-bold mr-1">Delete?</span>
                          <button
                            onClick={() => handleDelete(prob.id)}
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
                            onClick={() => handleStartEdit(prob)}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-all"
                            title="Edit Problem"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(prob.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-55 rounded transition-all"
                            title="Delete Problem"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-550 line-clamp-3 whitespace-pre-line border-t border-slate-100 pt-2 leading-relaxed">
                    {prob.description}
                  </p>

                  <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-32">
                    <pre>{prob.starter_code}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Problem Form */}
      <div className="lg:col-span-6">
        <form onSubmit={handleSubmit} className={`rounded-xl border ${editingProblem ? 'border-indigo-300 shadow-indigo-50/50 shadow-md' : 'border-slate-200 shadow-sm'} bg-white p-6 space-y-5 transition-all`}>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600">
              {editingProblem ? 'Edit Coding Exercise' : 'Create New coding exercise'}
            </h2>
            <p className="text-[10px] text-slate-405 mt-0.5">
              {editingProblem ? `Modifying exercise key: ${editingProblem.key}` : 'Add a dynamic problem instance with starter code and test cases.'}
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
              <span>{editingProblem ? 'Problem successfully updated!' : 'Problem successfully saved and published!'}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Problem Slug/Key *</label>
              <input
                type="text"
                placeholder="e.g. double-number"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Display Title *</label>
              <input
                type="text"
                placeholder="e.g. Double the Number"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Problem Description *</label>
            <textarea
              placeholder="Write clear instructions for the students. Supports markdown/newlines."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden font-sans"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Starter Code (.dap) *</label>
            <DapCodeEditor
              value={starterCode}
              onChange={setStarterCode}
              rows={8}
            />
          </div>

          {/* Test cases section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-600">Test Cases *</span>
              <button
                type="button"
                onClick={handleAddTestCase}
                className="flex items-center space-x-1 text-xs font-bold text-indigo-650 hover:text-indigo-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Case</span>
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {testCases.map((tc, index) => (
                <div key={index} className="flex items-start space-x-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 w-5 pt-1.5">#{index + 1}</span>
                  <div className="flex-1">
                    <textarea
                      placeholder="Input (stdin)"
                      value={tc.input}
                      onChange={(e) => handleTestCaseChange(index, 'input', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                        }
                      }}
                      rows={2}
                      className="w-full bg-white rounded border border-slate-200 px-2 py-1.5 text-[11px] font-mono focus:border-indigo-500 focus:outline-hidden resize-none"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <textarea
                      placeholder="Expected Output"
                      value={tc.expected}
                      onChange={(e) => handleTestCaseChange(index, 'expected', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                        }
                      }}
                      rows={2}
                      className="w-full bg-white rounded border border-slate-200 px-2 py-1.5 text-[11px] font-mono focus:border-indigo-500 focus:outline-hidden resize-none"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTestCase(index)}
                    disabled={testCases.length === 1}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors pt-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex space-x-3">
            {editingProblem && (
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
              disabled={submitting}
              className="flex-1 flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:brightness-105 hover:shadow-md px-4 py-3 text-xs font-bold text-white transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>{editingProblem ? 'Updating...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <Code className="h-4 w-4" />
                  <span>{editingProblem ? 'Update Exercise' : 'Save Coding Problem'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
