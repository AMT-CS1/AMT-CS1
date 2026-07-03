import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('target_id');
    if (!targetId) {
      return NextResponse.json({ error: 'Missing target_id' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`targets/${targetId}/grade`, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Target grade route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch grade' },
      { status: error.status || 500 }
    );
  }
}
