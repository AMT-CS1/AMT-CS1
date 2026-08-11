import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  try {
    const { targetId } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`homework/${targetId}/submit`, {
      method: 'POST',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Homework submit route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit this set' },
      { status: error.status || 500 }
    );
  }
}
