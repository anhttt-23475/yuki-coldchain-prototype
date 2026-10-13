'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ITEMS = [
  ['/', 'ダッシュボード', 'Dashboard'],
  ['/receiving', '入荷検品', 'Receiving inspection'],
  ['/inventory', '在庫・ロット', 'Inventory & lots'],
  ['/orders', '受注・引当', 'Orders & allocation'],
  ['/shipping', '出荷前チェック', 'Pre-shipment check'],
  ['/temperature', '温度アラーム', 'Temperature alarms'],
  ['/deviations', '逸脱ケース', 'Deviation cases'],
  ['/dispatch', '配車・拘束時間', 'Routes & driver hours'],
  ['/trace', 'トレース検索', 'Traceability'],
  ['/masters', 'マスター', 'Masters'],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="side">
      <div className="brand">Yuki Cold Chain</div>
      <div className="sub">食品コールドチェーン業務支援（Prototype）</div>
      {ITEMS.map(([href, ja, en]) => (
        <Link key={href} href={href} className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}>
          {ja}
          <small>{en}</small>
        </Link>
      ))}
    </nav>
  );
}

export function Logout() {
  return (
    <button
      className="secondary"
      style={{ padding: '4px 10px', fontSize: 12 }}
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = '/login';
      }}
    >
      ログアウト | Logout
    </button>
  );
}
