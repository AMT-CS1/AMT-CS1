import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const { id, filename } = await params;
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await apiFetch(`problems/${id}/references/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      token,
    });

    return NextResponse.json(data || { success: true });
  } catch (error: any) {
    console.error('Problem reference DELETE route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete reference file' },
      { status: error.status || 500 }
    );
  }
}
