import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  try {
    const { targetId } = await params;
    const body = await request.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`homework/${targetId}/mp-submit`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('MP Submit route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit MP answer' },
      { status: error.status || 500 }
    );
  }
}
