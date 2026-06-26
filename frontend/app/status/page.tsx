import Link from 'next/link';
import { ShieldCheck, ShieldAlert, ArrowLeft, RefreshCw, Database, HardDrive } from 'lucide-react';
import { apiFetch } from '@/lib/api';

// Opt out of caching so health check is always live
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HealthStatus {
  status: string;
  database: string;
  redis: string;
}

async function getHealth() {
  try {
    const data = await apiFetch<HealthStatus>('health', {
      method: 'GET',
      next: { revalidate: 0 },
    });
    return { data, error: null };
  } catch (err: any) {
    return {
      data: null,
      error: err.message || 'Failed to connect to the backend server.',
    };
  }
}

export default async function StatusPage() {
  const { data, error } = await getHealth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const isHealthy = data && data.status === 'healthy';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(20,184,166,0.04),transparent_50%)]" />

      <div className="relative w-full max-w-lg space-y-6">
        {/* Back Link */}
        <Link
          href="/login"
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
        </Link>

        {/* Status card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-extrabold text-slate-900">System Status</h1>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono select-all">{apiUrl}</span>
            </div>
          </div>

          <div className="mt-8 space-y-6">
            {/* Overall status indicator */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
              <span className="text-sm font-medium text-slate-655">API Connection</span>
              {isHealthy ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-250">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Healthy
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800 border border-red-250">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5 text-red-650" /> Unhealthy / Offline
                </span>
              )}
            </div>

            {/* Error Message Details */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-xs font-mono text-red-800">
                <span className="font-semibold block mb-1">Diagnostic Error:</span>
                {error}
              </div>
            )}

            {/* Service details */}
            <div className="grid grid-cols-2 gap-4">
              {/* Database Status */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center space-x-2.5">
                  <Database className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-bold text-slate-800">Database</span>
                </div>
                <div className="mt-3">
                  {data ? (
                    <span
                      className={`text-xs font-semibold ${
                        data.database === 'connected' ? 'text-emerald-650' : 'text-red-600'
                      }`}
                    >
                      {data.database}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Unknown</span>
                  )}
                </div>
              </div>

              {/* Redis Status */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center space-x-2.5">
                  <HardDrive className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-bold text-slate-800">Redis</span>
                </div>
                <div className="mt-3">
                  {data ? (
                    <span
                      className={`text-xs font-semibold ${
                        data.redis === 'connected' ? 'text-emerald-650' : 'text-red-600'
                      }`}
                    >
                      {data.redis}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">Unknown</span>
                  )}
                </div>
              </div>
            </div>

            {/* Diagnostics instructions */}
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-700 mb-1">Testing Guide:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Make sure the backend is running on <code className="text-teal-700">port 8000</code>.</li>
                <li>Verify your Docker stack services (Postgres, Redis) are online.</li>
              </ul>
            </div>

            {/* Refresh link button */}
            <Link
              href="/status"
              className="flex items-center justify-center w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-3 text-xs font-bold text-slate-700 transition-colors shadow-xs"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Force Refresh Status
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
