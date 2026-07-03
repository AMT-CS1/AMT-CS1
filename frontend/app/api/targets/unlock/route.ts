import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const { target_id, password } = await request.json();
    if (!target_id) {
      return NextResponse.json({ error: 'Missing target_id' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`targets/${target_id}/unlock`, {
      method: 'POST',
      token,
      body: JSON.stringify({ password }),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Target unlock route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlock practicum session' },
      { status: error.status || 500 }
    );
  }
}
