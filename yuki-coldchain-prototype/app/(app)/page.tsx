'use client';
import Link from 'next/link';
import { useApi, Loading } from '@/components/ui';

export default function Dashboard() {
  const { data, error, loading } = useApi<any>('/api/dashboard');
  const tiles: [string, string, string, string][] = data
    ? [
        [String(data.toAllocate), '未引当の受注 | Đơn chưa phân bổ', '/orders', ''],
        [String(data.review), 'business-review 保留 | Chờ xác nhận', '/orders', ''],
        [String(data.toShip), '出荷待ち | Chờ xuất', '/shipping', ''],
        [String(data.alarms), '未確認アラーム | Báo động chưa review', '/temperature', 'red'],
        [String(data.deviations), '未クローズ逸脱 | Sai lệch đang mở', '/deviations', 'red'],
        [String(data.quarantine), '隔離中ロット | Lô đang cách ly', '/inventory', 'red'],
        [String(data.nearExpiry), '期限3日以内の在庫 | Tồn sắp hết hạn', '/inventory', ''],
      ]
    : [];
  return (
    <>
      <h1>ダッシュボード | Dashboard</h1>
      <p className="lead">本日の要対応事項（Supabaseから集計）| Việc cần xử lý hôm nay</p>
      <Loading error={error} loading={loading && !data} />
      <div className="grid">
        {tiles.map(([n, l, href, c]) => (
          <Link key={l} href={href} className="stat" style={{ textDecoration: 'none' }}>
            <div className="n" style={{ color: c === 'red' && n !== '0' ? 'var(--red)' : undefined }}>{n}</div>
            <div className="l">{l}</div>
          </Link>
        ))}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>デモシナリオ | Kịch bản demo (fixture RFP)</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li><Link href="/orders/ORD-001">ORD-001</Link>: CUS-003 × CHI-002 — 期限 2026-09-18 のロットは <b>日付逆転禁止</b> でブロック（前回 09-20 受領済み）</li>
          <li><Link href="/orders/ORD-003">ORD-003</Link>: 消費期限が業務日に到達したロット（L-0009）は例外なくブロック</li>
          <li><Link href="/orders/ORD-002">ORD-002</Link> / <Link href="/orders/ORD-005">ORD-005</Link>: 配送ウィンドウ未確定（AGR-014/008）→ business-review（推論しない）</li>
          <li><Link href="/orders/ORD-004">ORD-004</Link>: 2分の1ルールの納品期限超過ロットを除外し、次のFEFO候補を選択</li>
          <li><Link href="/receiving">入荷検品</Link>: 冷蔵SKUを 7°C で登録 → 自動隔離＋逸脱作成／牛は9桁IDでブロック</li>
          <li><Link href="/dispatch">配車</Link>: RT-002（連続運転4h30m）・RT-003（拘束14h）は公開不可</li>
          <li><Link href="/trace">トレース</Link>: 牛個体識別番号 1234567890 で入荷〜出荷先を検索</li>
        </ol>
      </div>
    </>
  );
}
