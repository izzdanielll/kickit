import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'KICK IT — Play. Collect. Compete. Win.',
  description:
    'Collect player cards, build your ultimate 5-a-side squad, and rise through weekly football TCG tournaments.',
  icons: {
    icon: '/api/logo',
    shortcut: '/api/logo',
    apple: '/api/logo',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
