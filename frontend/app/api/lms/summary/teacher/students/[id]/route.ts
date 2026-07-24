import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params2 = new URLSearchParams();
    if (searchParams.get('course_id')) params2.set('course_id', searchParams.get('course_id')!);

    const qs = params2.toString();
    const data = await apiFetch(
      `lms/summary/teacher/students/${id}${qs ? `?${qs}` : ''}`,
      { method: 'GET', token }
    );
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LMS student drilldown GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch student report' },
      { status: error.status || 500 }
    );
  }
}
