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
    if (searchParams.get('actor')) params.set('actor', searchParams.get('actor')!);
    if (searchParams.get('event_type')) params.set('event_type', searchParams.get('event_type')!);
    
    const queryString = params.toString();
    const endpoint = queryString ? `student-logs?${queryString}` : 'student-logs';

    const data = await apiFetch(endpoint, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Student logs GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch student logs' },
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

    // Call FastAPI backend POST /student-logs
    const data = await apiFetch('student-logs', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Student logs proxy route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Student log submission failed' },
      { status: error.status || 500 }
    );
  }
}
