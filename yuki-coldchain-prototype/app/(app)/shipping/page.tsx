'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, BAND, dt } from '@/components/ui';

function ShipForm({ o, onDone }: { o: any; onDone: () => void }) {
  const [f, setF] = useState<any>({ vehicle_band: o.skus.temp_band, vehicle_temp_c: '', cargo_temp_c: '', seal_no: '' });
  const [msg, setMsg] = useState<any>(null);
  async function ship() {
    const r = await post(`/api/shipping/${o.order_id}`, f);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `出荷確定（${r.data.shipment_id}）。配送履歴に登録 → 次回の日付逆転チェックに使用されます` });
      onDone();
    } else setMsg({ kind: 'err', text: <>{r.data.error}{r.data.reasons && <ul>{r.data.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul>}{r.data.deviation_id && <>逸脱 <Link href="/deviations">{r.data.deviation_id}</Link> を作成</>}</> });
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div className="form">
        <div><label>車両温度帯</label><select value={f.vehicle_band} onChange={(e) => setF({ ...f, vehicle_band: e.target.value })}>{Object.entries(BAND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>車両温度 °C *</label><input type="number" step="0.1" value={f.vehicle_temp_c} onChange={(e) => setF({ ...f, vehicle_temp_c: e.target.value })} /></div>
        <div><label>貨物温度 °C *</label><input type="number" step="0.1" value={f.cargo_temp_c} onChange={(e) => setF({ ...f, cargo_temp_c: e.target.value })} /></div>
        <div><label>シール番号 *</label><input value={f.seal_no} onChange={(e) => setF({ ...f, seal_no: e.target.value })} /></div>
      </div>
      <div style={{ marginTop: 8 }}><button onClick={ship}>出荷確定 | Xác nhận xuất</button></div>
      <Msg m={msg} />
    </div>
  );
}

export default function Shipping() {
  const { data, error, loading, reload } = useApi<any>('/api/shipping');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h1>出荷前チェック | Pre-shipment check</h1>
      <p className="lead">車両温度帯・車両温度・貨物温度・シールを記録。ポリシー外は出荷をブロックし逸脱を作成。| Sai nhiệt độ → chặn xuất.</p>
      <Loading error={error} loading={loading && !data} />
      <div className="card">
        <table>
          <thead><tr><th>受注</th><th>顧客</th><th>SKU</th><th>温度帯</th><th>数量</th><th>ロット（期限）</th><th>状態</th><th></th></tr></thead>
          <tbody>
            {(data?.orders || []).map((o: any) => (
              <Fragment key={o.order_id}>
                <tr>
                  <td><Link href={`/orders/${o.order_id}`}>{o.order_id}</Link></td>
                  <td>{o.customer_id} {o.customers?.name_ja}</td>
                  <td>{o.sku_id} {o.skus?.name_ja}</td>
                  <td>{BAND[o.skus?.temp_band]}</td>
                  <td>{o.qty}</td>
                  <td>{o.lot?.lot_id}（{o.lot?.expiry_date}）</td>
                  <td><Status s={o.status} /></td>
                  <td>{o.status === 'allocated' && <button className="secondary" onClick={() => setOpen(open === o.order_id ? null : o.order_id)}>チェック入力</button>}</td>
                </tr>
                {open === o.order_id && (
                  <tr key={o.order_id + '-f'}><td colSpan={8}><ShipForm o={o} onDone={reload} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 && <p className="muted">引当済みの受注はありません。先に <Link href="/orders">受注・引当</Link> で引当してください。</p>}
        <div className="mock">モック: バーコード／シールスキャン（FR-OUT-04）・POD取得・ドライバー端末（オフラインキュー）は未実装。</div>
      </div>
      <div className="card">
        <h2>チェック記録 | Lịch sử kiểm tra</h2>
        <table><thead><tr><th>日時</th><th>受注</th><th>車両帯</th><th>車両/貨物温度</th><th>シール</th><th>結果</th><th>理由</th></tr></thead>
          <tbody>{(data?.checks || []).map((c: any) => (<tr key={c.id}><td>{dt(c.created_at)}</td><td>{c.order_id}</td><td>{BAND[c.vehicle_band]}</td><td>{c.vehicle_temp_c} / {c.cargo_temp_c}°C</td><td>{c.seal_no}</td><td><Status s={c.result} /></td><td>{c.reasons || '—'}</td></tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
