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

    // Check if this is a quiz completion request
    if (body._action === 'complete') {
      const { _action, ...payload } = body;
      const data = await apiFetch('exercises/complete', {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      });
      return NextResponse.json(data);
    }

    // Default: Call FastAPI backend POST /exercises/generate
    const data = await apiFetch('exercises/generate', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Exercises proxy route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Exercise generation failed' },
      { status: error.status || 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const problemKey = searchParams.get('problem_key');

    if (!problemKey) {
      return NextResponse.json({ error: 'Missing problem_key parameter' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`exercises/status/${encodeURIComponent(problemKey)}`, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Exercises status route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch quiz status' },
      { status: error.status || 500 }
    );
  }
}
