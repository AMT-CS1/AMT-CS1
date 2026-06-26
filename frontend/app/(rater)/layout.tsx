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
  const username = decoded?.user_metadata?.username || decoded?.sub || 'Rater';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between p-6">
        <div className="space-y-8">
          {/* Logo & Role Badge */}
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-500/10 border border-pink-500/25 text-pink-655">
              <GraduationCap className="h-5.5 w-5.5" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-wide text-slate-900 block">AMT-CS1</span>
              <span className="text-[10px] font-semibold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-100">
                Expert Rater
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <Link
              href="/rater"
              className="flex items-center space-x-3 rounded-lg bg-pink-50 px-3 py-2 text-sm font-semibold text-pink-700 border border-pink-100"
            >
              <Clipboard className="h-4.5 w-4.5" />
              <span>Rubric Tool</span>
            </Link>
            <div
              className="flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-455 cursor-not-allowed select-none"
              title="Coming soon"
            >
              <Award className="h-4.5 w-4.5" />
              <span>Calibration Logs (Soon)</span>
            </div>
          </nav>
        </div>

        {/* User Info & Sign Out */}
        <div className="space-y-4 pt-6 border-t border-slate-100">
          <div className="flex flex-col px-3">
            <span className="text-xs text-slate-400">Logged in as</span>
            <span className="text-sm font-bold text-slate-700 truncate">{username}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 px-8 flex items-center justify-between bg-white shadow-xs">
          <h2 className="text-lg font-bold text-slate-800 tracking-wide">Rubric Evaluation Tool</h2>
          <div className="flex items-center space-x-4">
            <Link
              href="/status"
              className="text-xs font-semibold text-pink-650 hover:text-pink-700 transition-colors"
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
