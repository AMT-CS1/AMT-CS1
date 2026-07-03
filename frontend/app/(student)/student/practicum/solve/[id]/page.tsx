import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import StudentWorkspace from '../../../StudentWorkspace';

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
      error: err.message || 'An error occurred while fetching practicum sessions.',
    };
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SolvePracticumPage({ params }: PageProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value || '';
  const { data: targets } = await getWeeklyTargets(token);
  const { id } = await params;

  return (
    <div className="py-2">
      <StudentWorkspace initialTargets={targets} selectedTargetId={id} mode="lab" />
    </div>
  );
}
