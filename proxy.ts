import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-session';

/**
 * Next's proxy layer (formerly `middleware`). Gate for everything under /admin. The login page
 * itself and the login endpoint stay open, because that is how you get a session in the first
 * place.
 */

const OPEN_PATHS = ['/admin/login', '/api/admin/login'];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Failing closed: an unconfigured deployment must not hand out admin access.
    return pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Admin is not configured (SESSION_SECRET missing).' }, { status: 503 })
      : NextResponse.redirect(new URL('/admin/login?error=unconfigured', request.url));
  }

  const authorized = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value, secret);
  if (authorized) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const login = new URL('/admin/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
