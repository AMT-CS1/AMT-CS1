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

    const data = await apiFetch('lms/imports', { method: 'GET', token });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('LMS imports GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch LMS imports' },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Forward the multipart body as-is. Passing FormData (not a string) leaves
    // apiFetch's Content-Type untouched, so fetch sets the multipart boundary.
    const formData = await request.formData();

    const data = await apiFetch('lms/imports', {
      method: 'POST',
      token,
      body: formData,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('LMS import POST route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'LMS import failed' },
      { status: error.status || 500 }
    );
  }
}
