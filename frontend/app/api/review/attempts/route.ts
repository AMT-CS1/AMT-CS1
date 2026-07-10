// Proxy khusus buat halaman review rater/peneliti (MisconceptionReview.tsx).
// Nerusin ke backend GET /review/attempts, yang ngasih daftar attempt +
// miskonsepsinya buat divalidasi manual.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Teruskan filter ke backend. Bedanya sama /api/attempts: di sini ada
    // only_misconceptions, buat nyaring cuma attempt yang punya miskonsepsi.
    const params = new URLSearchParams();
    if (searchParams.get('user_id')) params.set('user_id', searchParams.get('user_id')!);
    if (searchParams.get('task_ref')) params.set('task_ref', searchParams.get('task_ref')!);
    if (searchParams.get('only_misconceptions')) params.set('only_misconceptions', searchParams.get('only_misconceptions')!);

    const queryString = params.toString();
    const endpoint = queryString ? `review/attempts?${queryString}` : 'review/attempts';

    const data = await apiFetch(endpoint, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Review attempts GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attempts for review' },
      { status: error.status || 500 }
    );
  }
}
