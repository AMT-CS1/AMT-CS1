// Question-slot metadata for the teacher timeline detail (UC5).
// Flat path (quiz_id/slot_number as query params), consistent with the steps route.
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

    const quizId = searchParams.get('quiz_id');
    const slotNumber = searchParams.get('slot_number');
    if (!quizId || !slotNumber) {
      return NextResponse.json(
        { error: 'quiz_id and slot_number are required' },
        { status: 400 }
      );
    }

    const data = await apiFetch(`lms/quizzes/${quizId}/questions/${slotNumber}`, {
      method: 'GET',
      token,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LMS question slot GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch question detail' },
      { status: error.status || 500 }
    );
  }
}
