// Lazy per-attempt RESPONSE_HISTORY timeline for the teacher drill-down.
// Flat path (lms_user_id as a query param) — a child route under students/[id]
// isn't reliably registered by the dev router, and the backend path is unchanged.
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

    const lmsUserId = searchParams.get('lms_user_id');
    const quizId = searchParams.get('quiz_id');
    const attemptNumber = searchParams.get('attempt_number');
    const slotNumber = searchParams.get('slot_number');
    if (!lmsUserId || !quizId || !attemptNumber) {
      return NextResponse.json(
        { error: 'lms_user_id, quiz_id and attempt_number are required' },
        { status: 400 }
      );
    }

    const qs = new URLSearchParams({ quiz_id: quizId, attempt_number: attemptNumber });
    if (slotNumber) qs.set('slot_number', slotNumber);
    const data = await apiFetch(
      `lms/summary/teacher/students/${lmsUserId}/steps?${qs.toString()}`,
      { method: 'GET', token }
    );
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LMS student steps GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch response steps' },
      { status: error.status || 500 }
    );
  }
}
