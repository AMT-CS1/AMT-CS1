'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Fallback in case middleware doesn't redirect
    router.push('/login');
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-800">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent"></div>
        <p className="text-sm font-semibold tracking-wide text-slate-600">Loading AMT-CS1 Portal...</p>
      </div>
    </div>
  );
}
