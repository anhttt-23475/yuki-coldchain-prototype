'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Loading, Status, Badge, dt } from '@/components/ui';

export default function Trace() {
  const [q, setQ] = useState('1234567890');
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ms, setMs] = useState(0);
  async function search() {
    setLoading(true);
    const t = performance.now();
    const r = await fetch(`/api/trace?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    setMs(Math.round(performance.now() - t));
    setLoading(false);
    if (!r.ok) return setError(j.error);
    setError('');
    setRes(j);
  }
  return (
    <>
      <h1>トレース検索 | Traceability</h1>
      <p className="lead">ロットID・仕入先ロット・牛個体識別番号・米産地・SKUで検索。法定lane（米・牛）と社内laneを区別し、リンクが途切れる地点を明示。</p>
      <div className="card">
        <div className="row">
          <input style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="例: 1234567890 / 新潟県 / L-0008 / LEGACY" />
          <button onClick={search}>検索 | Tìm</button>
          {res && <span className="muted">{ms} ms</span>}
        </div>
        <p className="muted">例: <a onClick={() => setQ('1234567890')}>1234567890</a>（牛）・<a onClick={() => setQ('新潟県')}>新潟県</a>（米）・<a onClick={() => setQ('CHI-002')}>CHI-002</a>・<a onClick={() => setQ('LEGACY')}>LEGACY</a>（上流データなし）</p>
      </div>
      <Loading error={error} loading={loading} />
      {res && res.lots.length === 0 && res.brokenLinks.length === 0 && <p className="muted">該当なし</p>}
      {res?.lots.map((l: any) => (
        <div className="card" key={l.lot_id}>
          <h2>
            <Link href={`/inventory/${l.lot_id}`}>{l.lot_id}</Link> ・ {l.sku_id} {l.skus.name_ja} <Status s={l.status} />{' '}
            <Badge level={l.skus.trace_lane === 'internal_lot' ? 'info' : 'warn'}>{l.skus.trace_lane === 'beef' ? '牛lane（法定）' : l.skus.trace_lane === 'rice' ? '米lane（法定）' : '社内lane'}</Badge>
          </h2>
          <div className="form">
            <div><label>上流: 仕入先 / 仕入先ロット</label>{l.supplier_id} {l.suppliers.name_ja} / {l.supplier_lot}</div>
            {l.beef_individual_id && <div><label>牛個体識別番号</label>{l.beef_individual_id}</div>}
            {l.rice_origin && <div><label>米の産地</label>{l.rice_origin}</div>}
            <div><label>入荷</label>{dt(l.received_at)}（{l.qty_received}）</div>
            <div><label>数量照合</label>入荷 {l.qty_received} = 在庫 {l.qty_available} + 出荷 {l.shipments.reduce((a: number, s: any) => a + Number(s.qty), 0)} + 引当/その他 {Number(l.qty_received) - Number(l.qty_available) - l.shipments.reduce((a: number, s: any) => a + Number(s.qty), 0)}</div>
          </div>
          <h2 style={{ marginTop: 12 }}>下流: 出荷先 | Đã giao cho</h2>
          {l.shipments.length === 0 ? <p className="muted">出荷なし</p> : (
            <table><thead><tr><th>出荷ID</th><th>顧客</th><th>数量</th><th>完了</th></tr></thead>
              <tbody>{l.shipments.map((s: any) => (<tr key={s.id}><td>{s.id}</td><td>{s.customer_id} {s.customers?.name_ja}</td><td>{s.qty}</td><td>{dt(s.completed_at)}</td></tr>))}</tbody></table>
          )}
        </div>
      ))}
      {res?.brokenLinks.length > 0 && (
        <div className="card">
          <h2>リンク終端（上流データなし）| Liên kết bị đứt</h2>
          <table><thead><tr><th>出荷ID</th><th>ロット（旧）</th><th>顧客</th><th>SKU</th><th>期限</th><th>説明</th></tr></thead>
            <tbody>{res.brokenLinks.map((s: any) => (<tr key={s.id}><td>{s.id}</td><td>{s.lot_id}</td><td>{s.customer_id}</td><td>{s.sku_id}</td><td>{s.expiry_date}</td><td><Badge level="warn">{s.note}</Badge></td></tr>))}</tbody></table>
        </div>
      )}
      <div className="mock">モック: リコールケース管理・通知（FR-TRC-02/03）は未実装。検索のみ。</div>
    </>
  );
}
