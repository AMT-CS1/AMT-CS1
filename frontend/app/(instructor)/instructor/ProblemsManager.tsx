'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Code, CheckCircle, AlertCircle, RefreshCw, Pencil, X, FileCode2, Paperclip } from 'lucide-react';
import DapCodeEditor from '@/components/DapCodeEditor';
import { KcInfo, getKcDisplayName } from '@/lib/kc-utils';
import { SkeletonCardGrid } from '@/components/Skeleton';

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
  reference_solution?: string | null;
}

interface ReferenceFile {
  filename: string;
  content: string;
  isNew: boolean;
}

export default function ProblemsManager() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [kcList, setKcList] = useState<KcInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionId, setDescriptionId] = useState('');
  const [starterCode, setStarterCode] = useState('');
  const [referenceSolution, setReferenceSolution] = useState('');
  const [testCases, setTestCases] = useState<TestCase[]>([{ input: '', expected: '' }]);
  const [selectedKcs, setSelectedKcs] = useState<string[]>([]);

  // Reference solution files (stored in MinIO under problems/{id}_{key}/reference_solution/)
  const [refFiles, setRefFiles] = useState<ReferenceFile[]>([]);
  const [removedRefFiles, setRemovedRefFiles] = useState<string[]>([]);
  const [refFilesLoading, setRefFilesLoading] = useState(false);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Drawer and Delete states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [problemsRes, kcsRes] = await Promise.all([
        fetch('/api/problems'),
        fetch('/api/kcs')
      ]);

      if (!problemsRes.ok) {
        throw new Error(`Failed to fetch problems: ${problemsRes.status}`);
      }
      const data = await problemsRes.json();
      const kcsData = kcsRes.ok ? await kcsRes.json() : [];

      setProblems(data);
      setKcList(kcsData);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load coding problems.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  const toggleKc = (kcId: string) => {
    setSelectedKcs(prev =>
      prev.includes(kcId)
        ? prev.filter(k => k !== kcId)
        : [...prev, kcId]
    );
  };

  const handleStartEdit = (prob: Problem) => {
    setEditingProblem(prob);
    setKey(prob.key);
    setTitle(prob.title);
    setDescriptionEn(prob.description_en);
    setDescriptionId(prob.description_id);
    setStarterCode(prob.starter_code);
    setReferenceSolution(prob.reference_solution || '');
    setTestCases(prob.test_cases.length > 0 ? prob.test_cases : [{ input: '', expected: '' }]);
    setSelectedKcs(prob.kc_tags ? prob.kc_tags.split(',').map(k => k.trim()).filter(Boolean) : []);
    setRefFiles([]);
    setRemovedRefFiles([]);
    setError('');
    setSubmitSuccess(false);
    setIsDrawerOpen(true);
    // Load the problem's existing reference solution files
    setRefFilesLoading(true);
    fetch(`/api/problems/${prob.id}/references`)
      .then(res => (res.ok ? res.json() : []))
      .then((files: { filename: string; content: string | null }[]) => {
        setRefFiles(files.map(f => ({ filename: f.filename, content: f.content || '', isNew: false })));
      })
      .catch(err => console.error('Failed to load reference files', err))
      .finally(() => setRefFilesLoading(false));
  };

  const handleAttachRefFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || '');
        setRefFiles(prev => {
          // Re-attaching a file with the same name replaces it
          const others = prev.filter(f => f.filename !== file.name);
          return [...others, { filename: file.name, content, isNew: true }];
        });
        setRemovedRefFiles(prev => prev.filter(name => name !== file.name));
      };
      reader.readAsText(file);
    });
    if (refFileInputRef.current) refFileInputRef.current.value = '';
  };

  const handleRemoveRefFile = (filename: string) => {
    const target = refFiles.find(f => f.filename === filename);
    setRefFiles(prev => prev.filter(f => f.filename !== filename));
    if (target && !target.isNew) {
      setRemovedRefFiles(prev => [...prev, filename]);
    }
  };

  // Push reference-file changes (uploads + deletions) after the problem row is saved
  const syncRefFiles = async (problemId: string) => {
    for (const filename of removedRefFiles) {
      const res = await fetch(`/api/problems/${problemId}/references/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete reference file ${filename}.`);
      }
    }
    const newFiles = refFiles.filter(f => f.isNew);
    if (newFiles.length > 0) {
      const res = await fetch(`/api/problems/${problemId}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: newFiles.map(f => ({ filename: f.filename, content: f.content })) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upload reference solution files.');
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingProblem(null);
    setKey('');
    setTitle('');
    setDescriptionEn('');
    setDescriptionId('');
    setStarterCode('');
    setReferenceSolution('');
    setTestCases([{ input: '', expected: '' }]);
    setSelectedKcs([]);
    setRefFiles([]);
    setRemovedRefFiles([]);
    setError('');
    setSubmitSuccess(false);
    setSubmitting(false);
    setIsDrawerOpen(false);
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
      await fetchData();
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
    if (!key || !title || !descriptionEn || !descriptionId || !starterCode) {
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

    const kc_tags = selectedKcs.join(',');

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
          description_en: descriptionEn,
          description_id: descriptionId,
          starter_code: starterCode,
          test_cases: testCases,
          kc_tags,
          reference_solution: referenceSolution.trim() ? referenceSolution : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save problem');
      }

      // Sync attached reference solution files against the saved problem
      const problemId = editingProblem?.id || data.id;
      if (problemId) {
        await syncRefFiles(problemId);
      }

      setSubmitSuccess(true);
      
      // Keep drawer open for a brief success visual, then close or clear
      setTimeout(() => {
        handleCancelEdit();
        fetchData();
      }, 800);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while saving the problem.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      {/* List of Existing Problems (Full-width) */}
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Active Coding Exercises ({problems.length})
              </h2>
              <p className="text-[10px] text-slate-405 mt-0.5">Problems currently in PostgreSQL</p>
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
            <SkeletonCardGrid cards={4} />
          ) : problems.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No coding problems found in database.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {problems.map((prob) => (
                <div key={prob.id} className="p-5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/30 transition-all flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-extrabold text-sm text-slate-800">{prob.title}</span>
                        <code className="block text-[10px] font-mono text-indigo-650 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50 mt-1 max-w-max">
                          key: {prob.key}
                        </code>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {prob.kc_tags ? (
                            prob.kc_tags.split(',').map((tag) => (
                              <span key={tag.trim()} className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-full font-bold">
                                {tag.trim()}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">
                              No KC Tags
                            </span>
                          )}
                        </div>
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

                    <div className="border-t border-slate-100 pt-2 space-y-2">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">English Description</span>
                        <p className="text-xs text-slate-550 line-clamp-2 whitespace-pre-line leading-relaxed">
                          {prob.description_en}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Indonesian Description</span>
                        <p className="text-xs text-slate-550 line-clamp-2 whitespace-pre-line leading-relaxed">
                          {prob.description_id}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-24">
                    <pre>{prob.starter_code}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button (FAB) in the bottom right */}
      <button
        type="button"
        onClick={() => {
          handleCancelEdit();
          setIsDrawerOpen(true);
        }}
        className="fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
        title="Create New Problem"
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
                {editingProblem ? 'Edit Coding Exercise' : 'Create New coding exercise'}
              </h2>
              <p className="text-[10px] text-slate-405 mt-0.5">
                {editingProblem ? `Modifying exercise key: ${editingProblem.key}` : 'Add a dynamic problem instance with starter code and test cases.'}
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

          {/* KC Tags Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">KC Tags (Select all that apply) *</label>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Problem Description (English) *</label>
              <textarea
                placeholder="Write clear instructions in English. Supports markdown/newlines."
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden font-sans"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Problem Description (Indonesian) *</label>
              <textarea
                placeholder="Tulis instruksi dalam Bahasa Indonesia. Mendukung markdown/baris baru."
                value={descriptionId}
                onChange={(e) => setDescriptionId(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden font-sans"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Starter Code (.dap) *</label>
            <DapCodeEditor
              value={starterCode}
              onChange={setStarterCode}
              rows={8}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Reference Solution (.dap)</label>
            <p className="text-[10px] text-slate-400 mb-1.5">
              Optional. Correct solution used to detect misconceptions in failed submissions. Never shown to students.
            </p>
            <DapCodeEditor
              value={referenceSolution}
              onChange={setReferenceSolution}
              rows={8}
            />
          </div>

          {/* Reference Solution Files */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <span className="text-xs font-bold text-slate-600">Reference Solution Files (.dap)</span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Attach one or more alternative correct solutions. Each must compile; submissions are compared
                  against the closest one. Stored in MinIO under <code className="font-mono">problems/&#123;id&#125;_&#123;key&#125;/reference_solution/</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refFileInputRef.current?.click()}
                className="flex items-center space-x-1 text-xs font-bold text-indigo-650 hover:text-indigo-700 transition-colors shrink-0"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>Attach Files</span>
              </button>
              <input
                ref={refFileInputRef}
                type="file"
                accept=".dap,.txt,text/plain"
                multiple
                className="hidden"
                onChange={(e) => handleAttachRefFiles(e.target.files)}
              />
            </div>

            {refFilesLoading ? (
              <div className="py-3 flex items-center space-x-2 text-[11px] text-slate-400 font-semibold">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                <span>Loading existing reference files...</span>
              </div>
            ) : refFiles.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-medium py-1.5">
                No reference solution files attached yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {refFiles.map((f) => (
                  <div
                    key={f.filename}
                    className="flex items-center justify-between rounded-lg border border-slate-150 bg-slate-50/50 px-3 py-2"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <FileCode2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="text-[11px] font-mono font-bold text-slate-700 truncate">{f.filename}</span>
                      {f.isNew && (
                        <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full uppercase">
                          New
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 font-medium shrink-0">
                        {f.content.split('\n').length} lines
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRefFile(f.filename)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                      title="Remove file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
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
