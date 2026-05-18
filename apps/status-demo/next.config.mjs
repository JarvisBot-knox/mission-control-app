import path from 'node:path';

const nextConfig = {
  turbopack: {
    root: path.resolve('../..'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders(),
      },
    ];
  },
};

function securityHeaders() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rqwcrtqnsupcpwmmaxye.supabase.co';
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `connect-src 'self' ${supabaseUrl}`,
    'upgrade-insecure-requests',
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  ];
}

export default nextConfig;
