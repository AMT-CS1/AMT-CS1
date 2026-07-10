// Route handler Next.js yang jadi PERANTARA (proxy) antara browser dan
// backend FastAPI. Browser gak pernah nembak FastAPI langsung — semua lewat
// sini. Gunanya: token auth disimpen di cookie httpOnly (gak keliatan JS di
// browser), terus dari server-side ini token-nya ditempelin ke request backend.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

// GET /api/attempts → nerusin ke backend GET /attempts.
// Dipakai buat nampilin daftar attempt (mis. di dashboard instruktur).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cookieStore = await cookies();
    // Ambil token dari cookie; kalau gak ada berarti belum login.
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Teruskan filter query (user_id / task_ref) apa adanya ke backend.
    const params = new URLSearchParams();
    if (searchParams.get('user_id')) params.set('user_id', searchParams.get('user_id')!);
    if (searchParams.get('task_ref')) params.set('task_ref', searchParams.get('task_ref')!);
    
    const queryString = params.toString();
    const endpoint = queryString ? `attempts?${queryString}` : 'attempts';

    const data = await apiFetch(endpoint, {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Attempts GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch attempts' },
      { status: error.status || 500 }
    );
  }
}
// POST /api/attempts → nerusin ke backend POST /attempts.
// Ini jalur SUBMIT jawaban siswa. Response backend-nya (hasil evaluasi +
// misconceptions + p_matrix/q_matrix/matrix_similar) diteruskan balik apa
// adanya ke StudentWorkspace buat ditampilin.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lempar body submission (task_ref, content, target_id, dst) ke FastAPI.
    const data = await apiFetch('attempts', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Attempts proxy route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Attempt submission failed' },
      { status: error.status || 500 }
    );
  }
}
