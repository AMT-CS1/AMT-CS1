'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, GraduationCap, ArrowRight, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      // Successful login - redirect based on role
      router.push(`/${data.role}`);
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the login service.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError('');
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(20,184,166,0.08),transparent_50%)]" />
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-500/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-teal-500/5 blur-3xl" />

      <div className="relative w-full max-w-md space-y-8">
        {/* Branding header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 shadow-[0_0_20px_-3px_rgba(20,184,166,0.2)]">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            AMT-CS1
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Agentic Tutoring System for Introductory Computer Science
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-xl p-8 shadow-xl shadow-slate-200/50">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="flex items-start space-x-3 rounded-lg border border-red-200 bg-red-50/50 p-4 text-sm text-red-800">
                <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                  placeholder="e.g. student_user"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3.5 px-4 text-sm font-semibold text-white shadow-lg shadow-teal-600/15 transition-all hover:brightness-105 active:scale-[0.98] disabled:scale-100 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <span className="flex items-center">
                  Sign In <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </button>
          </form>

          {/* Quick-fill credentials template */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Developer Demo Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('student_user', 'studentpass')}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:bg-slate-100/80 hover:border-slate-350"
              >
                <span className="text-xs font-medium text-teal-600">Student</span>
                <span className="text-[10px] text-slate-500">student_user</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('instructor_user', 'instructorpass')}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:bg-slate-100/80 hover:border-slate-350"
              >
                <span className="text-xs font-medium text-indigo-600">Instructor/TA</span>
                <span className="text-[10px] text-slate-500">instructor_user</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('researcher_user', 'researcherpass')}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:bg-slate-100/80 hover:border-slate-350"
              >
                <span className="text-xs font-medium text-amber-600">Researcher</span>
                <span className="text-[10px] text-slate-500">researcher_user</span>
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('rater_user', 'raterpass')}
                className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:bg-slate-100/80 hover:border-slate-350"
              >
                <span className="text-xs font-medium text-pink-600">Expert Rater</span>
                <span className="text-[10px] text-slate-500">rater_user</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info link */}
        <div className="text-center">
          <a
            href="/status"
            className="inline-flex items-center text-xs font-semibold text-teal-650 hover:text-teal-700 transition-colors"
          >
            System status and connectivity check &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
