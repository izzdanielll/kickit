import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata: Metadata = {
  title: 'KICK IT — Play. Collect. Compete. Win.',
  description:
    'Collect player cards, build your ultimate 5-a-side squad, and rise through weekly football TCG tournaments.',
  icons: {
    icon: '/logo.jpg',
    shortcut: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A fresh request is required so Next can apply the CSP nonce to framework scripts.
  await connection();

  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
