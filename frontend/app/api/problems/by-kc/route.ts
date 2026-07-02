import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const kc = searchParams.get('kc');
    
    if (!kc) {
      return NextResponse.json({ error: 'Missing kc parameter' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`problems/by-kc?kc=${encodeURIComponent(kc)}`, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Problems by-kc GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch problems by KC' },
      { status: error.status || 500 }
    );
  }
}
