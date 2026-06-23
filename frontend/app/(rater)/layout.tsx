import { cookies } from 'next/headers';
import { decodeJwt } from '@/lib/auth';
import SignOutButton from '@/components/SignOutButton';
import { Clipboard, Award, GraduationCap } from 'lucide-react';
import Link from 'next/link';

export default async function RaterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const decoded = token ? decodeJwt(token) : null;
  const username = decoded?.sub || 'Rater';

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-900 bg-slate-900/30 flex flex-col justify-between p-6">
        <div className="space-y-8">
          {/* Logo & Role Badge */}
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
              <GraduationCap className="h-5.5 w-5.5" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-wide text-white block">AMT-CS1</span>
              <span className="text-[10px] font-semibold text-pink-400 bg-pink-500/5 px-2 py-0.5 rounded-full border border-pink-500/10">
                Expert Rater
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <Link
              href="/rater"
              className="flex items-center space-x-3 rounded-lg bg-pink-500/5 px-3 py-2 text-sm font-medium text-pink-400 border border-pink-500/10"
            >
              <Clipboard className="h-4.5 w-4.5" />
              <span>Rubric Tool</span>
            </Link>
            <div
              className="flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 cursor-not-allowed select-none"
              title="Coming soon"
            >
              <Award className="h-4.5 w-4.5" />
              <span>Calibration Logs (Soon)</span>
            </div>
          </nav>
        </div>

        {/* User Info & Sign Out */}
        <div className="space-y-4 pt-6 border-t border-slate-900">
          <div className="flex flex-col px-3">
            <span className="text-xs text-slate-500">Logged in as</span>
            <span className="text-sm font-semibold text-slate-350 truncate">{username}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-900 px-8 flex items-center justify-between bg-slate-900/10">
          <h2 className="text-lg font-bold text-white tracking-wide">Rubric Evaluation Tool</h2>
          <div className="flex items-center space-x-4">
            <Link
              href="/status"
              className="text-xs font-semibold text-pink-500 hover:text-pink-400 transition-colors"
            >
              API Status
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
