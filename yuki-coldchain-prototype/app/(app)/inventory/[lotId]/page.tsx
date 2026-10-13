'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, BAND, EXP, dt } from '@/components/ui';

const ACTIONS: Record<string, [string, string, string][]> = {
  available: [['quarantine', '隔離する | Cách ly', 'danger']],
  quarantine: [['available', '解除（再判定OK）| Giải phóng', ''], ['scrapped', '廃棄 | Huỷ', 'danger']],
  scrapped: [],
};

export default function LotDetail({ params }: { params: { lotId: string } }) {
  const { data, error, loading, reload } = useApi<any>(`/api/lots/${params.lotId}`);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<any>(null);
  async function act(to: string) {
    const r = await post(`/api/lots/${params.lotId}/status`, { to, reason });
    setMsg(r.ok ? { kind: 'ok', text: '状態を更新しました（履歴に追記）' } : { kind: 'err', text: r.data.error });
    if (r.ok) {
      setReason('');
      reload();
    }
  }
  const l = data?.lot;
  return (
    <>
      <p><Link href="/inventory">← 在庫一覧</Link></p>
      <h1>ロット詳細 {params.lotId}</h1>
      <Loading error={error} loading={loading && !data} />
      {l && (
        <>
          <div className="card">
            <div className="form">
              <div><label>SKU</label>{l.sku_id} {l.skus.name_ja}</div>
              <div><label>温度帯 / 期限種別</label>{BAND[l.skus.temp_band]} / {EXP[l.skus.expiry_type]}</div>
              <div><label>製造日 → 期限</label>{l.production_date} → {l.expiry_date}</div>
              <div><label>仕入先 / 仕入先ロット</label>{l.suppliers.name_ja} / {l.supplier_lot}</div>
              <div><label>数量（利用可能 / 入荷）</label>{l.qty_available} / {l.qty_received}</div>
              <div><label>ロケーション</label>{l.location_id}（{BAND[l.locations.temp_band]}{l.locations.is_quarantine ? '・隔離区画' : ''}）</div>
              <div><label>状態</label><Status s={l.status} /></div>
              {l.beef_individual_id && <div><label>牛個体識別番号</label>{l.beef_individual_id}</div>}
              {l.rice_origin && <div><label>米の産地</label>{l.rice_origin}</div>}
            </div>
          </div>
          <div className="card">
            <h2>状態変更（品質管理者）| Đổi trạng thái</h2>
            <p className="muted">有効な遷移のみ表示。隔離を経由しない廃棄は不可。ハード削除なし。| Chỉ hiển thị chuyển trạng thái hợp lệ.</p>
            {ACTIONS[l.status].length ? (
              <>
                <label>根拠・理由 *</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 再測定 3.2°C で温度帯内を確認" />
                <div className="row" style={{ marginTop: 8 }}>
                  {ACTIONS[l.status].map(([to, label, cls]) => (
                    <button key={to} className={cls} onClick={() => act(to)}>{label}</button>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">廃棄済みのため操作なし</p>
            )}
            <div className="mock">モック: 起票者/承認者分離（maker-checker）と品質管理者ロールの権限チェックは未実装（デモユーザー1名）。</div>
            <Msg m={msg} />
          </div>
          <div className="card">
            <h2>状態履歴（追記のみ）| Lịch sử</h2>
            <table>
              <thead><tr><th>日時</th><th>イベント</th><th>遷移</th><th>理由</th><th>実施者</th></tr></thead>
              <tbody>
                {data.events.map((e: any) => (
                  <tr key={e.id}><td>{dt(e.created_at)}</td><td>{e.event_type}</td><td>{e.from_status ?? '—'} → {e.to_status ?? '—'}</td><td>{e.reason}</td><td>{e.actor}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>出荷先 | Đã giao cho</h2>
            {data.shipments.length === 0 ? <p className="muted">出荷履歴なし</p> : (
              <table>
                <thead><tr><th>出荷ID</th><th>顧客</th><th>数量</th><th>完了日時</th></tr></thead>
                <tbody>{data.shipments.map((s: any) => (<tr key={s.id}><td>{s.id}</td><td>{s.customer_id} {s.customers?.name_ja}</td><td>{s.qty}</td><td>{dt(s.completed_at)}</td></tr>))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
