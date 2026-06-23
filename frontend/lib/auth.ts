export interface DecodedToken {
  sub: string; // username
  role: 'student' | 'instructor' | 'researcher' | 'rater';
  exp: number;
  [key: string]: any;
}

/**
 * Decodes a JWT token safely in any environment (browser, node, edge middleware).
 */
export function decodeJwt(token: string): DecodedToken | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

/**
 * Returns the default dashboard path for a given role.
 */
export function getDashboardPath(role: string): string {
  switch (role) {
    case 'student':
      return '/student';
    case 'instructor':
      return '/instructor';
    case 'researcher':
      return '/researcher';
    case 'rater':
      return '/rater';
    default:
      return '/login';
  }
}
