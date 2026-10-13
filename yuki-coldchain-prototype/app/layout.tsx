import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Yuki Cold Chain Prototype', description: 'LAB-2 prototype — 食品コールドチェーン業務支援システム' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
