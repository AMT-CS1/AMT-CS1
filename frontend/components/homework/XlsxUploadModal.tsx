'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2, X, Users, Target, HelpCircle, GitFork, Download } from 'lucide-react';
import { XlsxUploadResponse } from '@/lib/homework-types';
import { uploadXlsxFile } from '@/lib/homework-api';

interface XlsxUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function XlsxUploadModal({ isOpen, onClose, onSuccess }: XlsxUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [result, setResult] = useState<XlsxUploadResponse | null>(null);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
        setError('Please select a valid spreadsheet file (.xlsx or .xls)');
        return;
      }
      setFile(selected);
      setError('');
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await uploadXlsxFile(file);
      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to process XLSX file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-all animate-in fade-in">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        
        {/* Header - Light cohesive styling matching instructor layout */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">Upload XLSX Course Workbook</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reconcile users, homework targets & question banks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* File Input Box */}
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-8 text-center bg-slate-50 dark:bg-slate-800/40 transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {file ? file.name : 'Drag & drop your .xlsx file here, or click to browse'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported sheets: participants, weekly_targets, question bank, problem_misconceptions
                </p>
              </div>
            </div>
          </div>

          {/* Download Sample Template Link */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Don't have the spreadsheet template?</span>
            <a
              href="/templates/sample_homework_template.xlsx"
              download="sample_homework_template.xlsx"
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Sample Template (.xlsx)</span>
            </a>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center space-x-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success summary display */}
          {result && result.details && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>Spreadsheet Processed Successfully!</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-2">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    <strong>{result.details.participants}</strong> Participants
                  </span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-2">
                  <Target className="h-4 w-4 text-emerald-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    <strong>{result.details.weekly_targets}</strong> Targets
                  </span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-2">
                  <HelpCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    <strong>{result.details.misconception_questions}</strong> Question Bank
                  </span>
                </div>
                <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-2">
                  <GitFork className="h-4 w-4 text-emerald-600" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    <strong>{result.details.problem_misconceptions}</strong> Mappings
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Close
          </button>
          <button
            disabled={!file || uploading}
            onClick={handleUpload}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md flex items-center space-x-2 transition-all ${
              !file || uploading
                ? 'bg-slate-400 dark:bg-slate-800 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Upload & Reconcile</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
