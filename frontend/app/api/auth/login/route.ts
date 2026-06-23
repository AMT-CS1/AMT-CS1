import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { decodeJwt } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // FastAPI auth/token endpoint uses OAuth2PasswordRequestForm
    // which expects application/x-www-form-urlencoded format
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const data = await apiFetch<{ access_token: string; token_type: string }>('auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const decoded = decodeJwt(data.access_token);
    if (!decoded || !decoded.role) {
      return NextResponse.json(
        { error: 'Invalid token payload received from backend' },
        { status: 500 }
      );
    }

    // Save token in httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set('token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour (matching FastAPI ACCESS_TOKEN_EXPIRE_MINUTES)
    });

    return NextResponse.json({
      success: true,
      username: decoded.sub,
      role: decoded.role,
    });
  } catch (error: any) {
    console.error('Login route handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: error.status || 401 }
    );
  }
}
