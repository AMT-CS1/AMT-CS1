import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { decodeJwt } from '@/lib/auth';
import StudentWorkspace from './StudentWorkspace';

async function getWeeklyTargets(token: string) {
  try {
    const data = await apiFetch<any[]>('targets', {
      token,
      method: 'GET',
    });
    return { data, error: null };
  } catch (err: any) {
    console.error('Failed to load targets in server component:', err);
    return {
      data: [],
      error: err.message || 'An error occurred while fetching weekly targets.',
    };
  }
}

export default async function StudentPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';
  const { data: targets } = await getWeeklyTargets(token);
  // JWT `sub` is the user id (UUID) — namespaces the client-side progress cache (R2).
  const userId = (token && decodeJwt(token)?.sub) || '';

  return (
    <div className="py-2">
      <StudentWorkspace initialTargets={targets} userId={userId} />
    </div>
  );
}
