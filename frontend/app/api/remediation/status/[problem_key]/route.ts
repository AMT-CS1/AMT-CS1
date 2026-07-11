import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ problem_key: string }> }
) {
  try {
    const { problem_key } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`remediation/status/${encodeURIComponent(problem_key)}`, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Remediation status route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch remediation status' },
      { status: error.status || 500 }
    );
  }
}
