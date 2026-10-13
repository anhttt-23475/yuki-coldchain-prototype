'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, BAND } from '@/components/ui';
import { BUSINESS_DATE, addDays } from '@/lib/rules';

export default function Orders() {
  const { data, error, loading, reload } = useApi<any[]>('/api/orders');
  const masters = useApi<any>('/api/masters');
  const [f, setF] = useState<any>({ customer_id: '', sku_id: '', qty: '', requested_date: addDays(BUSINESS_DATE, 1) });
  const [msg, setMsg] = useState<any>(null);
  async function create() {
    const r = await post('/api/orders', f);
    setMsg(r.ok ? { kind: 'ok', text: <>受注 <Link href={`/orders/${r.data.order_id}`}>{r.data.order_id}</Link> を登録しました → 引当画面へ</> } : { kind: 'err', text: r.data.error });
    if (r.ok) reload();
  }
  return (
    <>
      <h1>受注・引当 | Orders & allocation</h1>
      <p className="lead">受注を選択すると、除外順序（消費期限→温度帯→隔離→配送ウィンドウ→日付逆転→FEFO/FIFO）で候補ロットを評価します。</p>
      <Loading error={error} loading={loading && !data} />
      <div className="card">
        <table>
          <thead><tr><th>受注</th><th>顧客</th><th>SKU</th><th>温度帯</th><th>数量</th><th>納品要求日</th><th>状態</th><th>引当ロット</th></tr></thead>
          <tbody>
            {(data || []).map((o: any) => (
              <tr key={o.order_id}>
                <td><Link href={`/orders/${o.order_id}`}>{o.order_id}</Link></td>
                <td>{o.customer_id} {o.customers?.name_ja}</td>
                <td>{o.sku_id} {o.skus?.name_ja}</td>
                <td>{BAND[o.skus?.temp_band]}</td>
                <td>{o.qty}</td>
                <td>{o.requested_date}</td>
                <td><Status s={o.status} /></td>
                <td>{o.allocated_lot_id ? <Link href={`/inventory/${o.allocated_lot_id}`}>{o.allocated_lot_id}</Link> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {masters.data && (
        <div className="card">
          <h2>受注登録 | Tạo đơn hàng</h2>
          <div className="form">
            <div><label>顧客 *</label><select value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}><option value="">選択</option>{masters.data.customers.map((c: any) => <option key={c.customer_id} value={c.customer_id}>{c.customer_id} {c.name_ja}</option>)}</select></div>
            <div><label>SKU *</label><select value={f.sku_id} onChange={(e) => setF({ ...f, sku_id: e.target.value })}><option value="">選択</option>{masters.data.skus.map((s: any) => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} {s.name_ja}</option>)}</select></div>
            <div><label>数量 *</label><input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></div>
            <div><label>納品要求日 *</label><input type="date" value={f.requested_date} onChange={(e) => setF({ ...f, requested_date: e.target.value })} /></div>
          </div>
          <Msg m={msg} />
          <div style={{ marginTop: 12 }}><button onClick={create}>登録 | Tạo</button></div>
          <div className="mock">モック: ERPからのCSV受注取込（IF-ERP-01）は未実装。画面から手入力で代替。</div>
        </div>
      )}
    </>
  );
}
