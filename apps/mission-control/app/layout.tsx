import './globals.css';

export const metadata = {
  title: 'JARVIS Mission Control',
  description: 'Private OpenClaw operator console and app factory dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
