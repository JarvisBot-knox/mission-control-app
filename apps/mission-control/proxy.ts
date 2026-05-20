import { NextRequest, NextResponse } from 'next/server';

function unauthorized() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mission Control"',
    },
  });
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.MISSION_CONTROL_USER;
  const expectedPassword = process.env.MISSION_CONTROL_PASSWORD;

  if (!expectedUser || !expectedPassword) return unauthorized();

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorized();

  const [user, password] = atob(header.slice(6)).split(':');

  if (user !== expectedUser || password !== expectedPassword) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
