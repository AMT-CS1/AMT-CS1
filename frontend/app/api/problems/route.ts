import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch('problems', {
      method: 'GET',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Problems GET route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch problems' },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch('problems', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Problems POST route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save problem' },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
    }

    const body = await request.json();
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`problems/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Problems PUT route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update problem' },
      { status: error.status || 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`problems/${id}`, {
      method: 'DELETE',
      token,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Problems DELETE route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete problem' },
      { status: error.status || 500 }
    );
  }
}

