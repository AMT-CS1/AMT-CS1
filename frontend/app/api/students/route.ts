import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch('students', { method: 'GET', token });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Students list route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch students' },
      { status: error.status || 500 }
    );
  }
}
