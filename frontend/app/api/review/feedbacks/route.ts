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
    if (searchParams.get('user_id')) params.set('user_id', searchParams.get('user_id')!);
    if (searchParams.get('problem_key')) params.set('problem_key', searchParams.get('problem_key')!);

    const queryString = params.toString();
    const endpoint = queryString ? `review/feedbacks?${queryString}` : 'review/feedbacks';

    const data = await apiFetch(endpoint, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Review feedbacks GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feedbacks for review' },
      { status: error.status || 500 }
    );
  }
}
