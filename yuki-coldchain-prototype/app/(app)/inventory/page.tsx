'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, Loading, Status, Badge, BAND, EXP } from '@/components/ui';
import { BUSINESS_DATE, daysBetween } from '@/lib/rules';

export default function Inventory() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useApi<any[]>(`/api/lots${status ? `?status=${status}` : ''}`);
  return (
    <>
      <h1>在庫・ロット照会 | Inventory & lots</h1>
      <p className="lead">期限昇順（FEFO順）。隔離中ロットは引当・ピッキング対象外。| Sắp theo hạn tăng dần.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ margin: 0 }}>状態 | Trạng thái</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }}>
          <option value="">すべて</option>
          <option value="available">利用可能</option>
          <option value="quarantine">隔離中</option>
          <option value="scrapped">廃棄</option>
        </select>
      </div>
      <Loading error={error} loading={loading && !data} />
      <div className="card">
        <table>
          <thead><tr><th>ロット</th><th>SKU</th><th>温度帯</th><th>期限種別</th><th>期限</th><th>残日数</th><th>利用可能/入荷</th><th>ロケーション</th><th>状態</th><th>注意</th></tr></thead>
          <tbody>
            {(data || []).map((l: any) => {
              const left = daysBetween(BUSINESS_DATE, l.expiry_date);
              const mismatch = l.locations?.temp_band !== l.skus?.temp_band;
              return (
                <tr key={l.lot_id}>
                  <td><Link href={`/inventory/${l.lot_id}`}>{l.lot_id}</Link></td>
                  <td>{l.sku_id} {l.skus?.name_ja}</td>
                  <td>{BAND[l.skus?.temp_band]}</td>
                  <td>{EXP[l.skus?.expiry_type]}</td>
                  <td>{l.expiry_date}</td>
                  <td>{left <= 0 ? <Badge level="block">{left}日</Badge> : left <= 3 ? <Badge level="warn">{left}日</Badge> : `${left}日`}</td>
                  <td>{l.qty_available} / {l.qty_received}</td>
                  <td>{l.location_id}</td>
                  <td><Status s={l.status} /></td>
                  <td>{mismatch && <Badge level="block">温度帯不一致</Badge>}{l.skus?.trace_lane !== 'internal_lot' && <Badge level="info">{l.skus?.trace_lane === 'beef' ? '牛' : '米'}</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
