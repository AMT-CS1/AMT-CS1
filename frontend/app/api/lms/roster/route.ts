import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Forward the multipart body untouched so fetch sets the boundary itself.
    const formData = await request.formData();

    const data = await apiFetch('lms/roster', {
      method: 'POST',
      token,
      body: formData,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Roster import POST route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Roster import failed' },
      { status: error.status || 500 }
    );
  }
}
