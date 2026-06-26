import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call FastAPI backend POST /attempts
    const data = await apiFetch('attempts', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Attempts proxy route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Attempt submission failed' },
      { status: error.status || 500 }
    );
  }
}
