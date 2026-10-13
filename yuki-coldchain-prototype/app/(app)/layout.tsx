import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav, Logout } from '@/components/Nav';
import { BUSINESS_DATE } from '@/lib/rules';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect('/login');
  return (
    <div className="shell">
      <Nav />
      <div className="main">
        <div className="top">
          <span>
            業務日（デモ）| Business date: <b>{BUSINESS_DATE}</b> ・ 温度ポリシー TEMP-2026.1
          </span>
          <span className="row">
            {user.email} <Logout />
          </span>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
