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
    <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-500 border-t-transparent"></div>
        <p className="text-sm font-medium tracking-wide">Loading AMT-CS1 Portal...</p>
      </div>
    </div>
  );
}
