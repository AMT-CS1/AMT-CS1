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

    // Forward query params to backend
    const params = new URLSearchParams();
    if (searchParams.get('user_id')) params.set('user_id', searchParams.get('user_id')!);
    if (searchParams.get('task_ref')) params.set('task_ref', searchParams.get('task_ref')!);
    
    const queryString = params.toString();
    const endpoint = queryString ? `attempts?${queryString}` : 'attempts';

    const data = await apiFetch(endpoint, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Attempts GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attempts' },
      { status: error.status || 500 }
    );
  }
}
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
