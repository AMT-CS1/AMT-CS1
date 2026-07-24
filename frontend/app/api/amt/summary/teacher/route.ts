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
    for (const key of ['course_id', 'context', 'problem_key']) {
      const v = searchParams.get(key);
      if (v) params.set(key, v);
    }

    const qs = params.toString();
    const data = await apiFetch(`amt/summary/teacher${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      token,
    });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('AMT teacher summary GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch interactions summary' },
      { status: error.status || 500 }
    );
  }
}
