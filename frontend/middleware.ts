import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt, getDashboardPath } from './lib/auth';

// Define protected route prefixes and their matching roles
const ROLE_ROUTES: { prefix: string; role: string }[] = [
  { prefix: '/student', role: 'student' },
  { prefix: '/instructor', role: 'instructor' },
  { prefix: '/researcher', role: 'researcher' },
  { prefix: '/rater', role: 'rater' },
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('token')?.value;

  // 1. Handle status page (public access)
  if (pathname === '/status') {
    return NextResponse.next();
  }

  // 2. Decode token if present
  let decodedToken = token ? decodeJwt(token) : null;
  const isTokenExpired = decodedToken && decodedToken.exp * 1000 < Date.now();

  // If token is expired, treat as unauthenticated
  if (isTokenExpired) {
    decodedToken = null;
  }

  // 3. User is authenticated
  if (decodedToken) {
    const userRole = decodedToken.role;

    // If user is trying to access login page or root, redirect to their role-gated dashboard
    if (pathname === '/login' || pathname === '/') {
      const dashboardPath = getDashboardPath(userRole);
      return NextResponse.redirect(new URL(dashboardPath, request.url));
    }

    // Check if user is accessing a route gated to a different role
    for (const route of ROLE_ROUTES) {
      if (pathname.startsWith(route.prefix) && userRole !== route.role) {
        // Redirect to their own dashboard
        const dashboardPath = getDashboardPath(userRole);
        return NextResponse.redirect(new URL(dashboardPath, request.url));
      }
    }

    // Allow access to matching protected route
    return NextResponse.next();
  }

  // 4. User is NOT authenticated
  // If attempting to access any role-gated path or root, redirect to login
  const isProtectedRoute = ROLE_ROUTES.some((route) => pathname.startsWith(route.prefix));
  if (isProtectedRoute || pathname === '/') {
    const loginUrl = new URL('/login', request.url);
    
    // Create response redirect
    const response = NextResponse.redirect(loginUrl);
    
    // Clear cookie if there was an expired/invalid token
    if (token) {
      response.cookies.set('token', '', { path: '/', maxAge: 0 });
    }
    return response;
  }

  return NextResponse.next();
}

// Configure routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
