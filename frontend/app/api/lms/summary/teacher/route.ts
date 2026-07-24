import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URLSearchParams();
    if (searchParams.get('course_id')) params.set('course_id', searchParams.get('course_id')!);
    if (searchParams.get('quiz_id')) params.set('quiz_id', searchParams.get('quiz_id')!);

    const qs = params.toString();
    const data = await apiFetch(`lms/summary/teacher${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LMS teacher summary GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch teacher summary' },
      { status: error.status || 500 }
    );
  }
}
