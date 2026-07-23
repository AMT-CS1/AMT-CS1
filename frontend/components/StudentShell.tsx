'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, History, GraduationCap, Heart, PanelLeftClose, PanelLeftOpen, FlaskConical } from 'lucide-react';
import SignOutButton from '@/components/SignOutButton';

export default function StudentShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const inPracticum = pathname?.startsWith('/student/practicum');
  const inHistory = pathname?.startsWith('/student/history');

  const navLinkClass = (active: boolean) =>
    active
      ? 'flex items-center space-x-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 border border-teal-100'
      : 'flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside
        className={`w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between p-6 transition-[margin] duration-300 ease-out ${sidebarOpen ? 'ml-0' : '-ml-64'}`}
        aria-hidden={!sidebarOpen}
      >
        <div className="space-y-8">
          {/* Logo & Role Badge */}
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/25 text-teal-600">
              <GraduationCap className="h-5.5 w-5.5" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-wide text-slate-900 block">AMT-CS1</span>
              <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                Student Portal
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <Link href="/student" className={navLinkClass(!inPracticum && !inHistory)}>
              <BookOpen className="h-4.5 w-4.5" />
              <span>Homework</span>
            </Link>
            <Link href="/student/practicum" className={navLinkClass(!!inPracticum)}>
              <FlaskConical className="h-4.5 w-4.5" />
              <span>Checkpoint</span>
            </Link>
            <Link href="/student/history" className={navLinkClass(!!inHistory)}>
              <History className="h-4.5 w-4.5" />
              <span>My History</span>
            </Link>
          </nav>
        </div>

        {/* User Info & Sign Out */}
        <div className="space-y-4 pt-6 border-t border-slate-100">
          <div className="flex flex-col px-3">
            <span className="text-xs text-slate-400">Logged in as</span>
            <span className="text-sm font-bold text-slate-700 truncate">{username}</span>
          </div>
          <SignOutButton />

          <div className="flex items-center justify-center space-x-1.5 px-3 text-[10px] text-slate-400">
            <Heart className="h-3 w-3 text-teal-500 fill-teal-500/20" />
            <span>Supportive Learning</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between bg-white shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(o => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <h2 className="text-lg font-bold text-slate-800 tracking-wide">Homework</h2>
          </div>
          <div className="flex items-center space-x-4">
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 sm:px-8 sm:py-4">{children}</main>
      </div>
    </div>
  );
}
