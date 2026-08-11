'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { clearAllStudentKeys } from '@/lib/student-storage';

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    if (loading) return;
    setLoading(true);
    // R2: wipe the per-student progress cache BEFORE the network call — storage
    // removal is synchronous and can't fail; the POST can. On a shared machine
    // nothing of this account may survive for the next login.
    clearAllStudentKeys();
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
      });
      if (res.ok) {
        router.refresh(); // Triggers middleware re-evaluation
        // replace (not push): Back must not land on the authenticated page.
        router.replace('/login');
      } else {
        console.error('Logout request failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="inline-flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-550 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <LogOut className="h-4.5 w-4.5" />
      <span>{loading ? 'Signing out...' : 'Sign Out'}</span>
    </button>
  );
}
