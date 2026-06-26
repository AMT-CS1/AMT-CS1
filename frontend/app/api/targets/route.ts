import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch('targets', {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Targets GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch targets' },
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

    // Call FastAPI backend POST /targets
    const data = await apiFetch('targets', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Targets route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Configuration failed' },
      { status: error.status || 500 }
    );
  }
}
