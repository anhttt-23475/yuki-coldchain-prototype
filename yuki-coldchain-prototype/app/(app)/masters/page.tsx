'use client';
import { useApi, Loading, Badge, BAND, EXP } from '@/components/ui';
import { RULE_LABEL } from '@/lib/rules';

export default function Masters() {
  const { data, error, loading } = useApi<any>('/api/masters');
  return (
    <>
      <h1>マスター | Masters（参照のみ）</h1>
      <Loading error={error} loading={loading && !data} />
      {data && (
        <>
          <div className="card">
            <h2>温度帯ポリシー（ユキ独自・版管理）</h2>
            <table><thead><tr><th>帯</th><th>下限</th><th>上限</th><th>版</th><th>有効日</th></tr></thead>
              <tbody>{data.policies.map((p: any) => (<tr key={p.band}><td>{p.label_ja}</td><td>{p.min_c ?? '—'}°C</td><td>{p.max_c}°C</td><td>{p.version}</td><td>{p.effective_from}</td></tr>))}</tbody></table>
          </div>
          <div className="card">
            <h2>SKU（R-02）</h2>
            <table><thead><tr><th>SKU</th><th>名称</th><th>単位</th><th>温度帯</th><th>期限種別</th><th>トレースlane</th></tr></thead>
              <tbody>{data.skus.map((s: any) => (<tr key={s.sku_id}><td>{s.sku_id}</td><td>{s.name_ja}</td><td>{s.unit}</td><td>{BAND[s.temp_band]}</td><td>{s.expiry_type === 'USE_BY' ? <Badge level="block">{EXP[s.expiry_type]}</Badge> : EXP[s.expiry_type]}</td><td>{s.trace_lane}</td></tr>))}</tbody></table>
          </div>
          <div className="card">
            <h2>顧客×SKU契約（R-04）— 配送ウィンドウは商慣行（法定ではない）</h2>
            <table><thead><tr><th>契約</th><th>顧客</th><th>SKU</th><th>配送条件</th><th>配送ウィンドウ</th></tr></thead>
              <tbody>{data.agreements.map((a: any) => (<tr key={a.agreement_id}><td>{a.agreement_id}</td><td>{a.customer_id}</td><td>{a.sku_id}</td><td>{a.delivery_term}</td><td>{a.window_rule ? RULE_LABEL[a.window_rule] : <Badge level="review">未確定（推論しない）</Badge>}</td></tr>))}</tbody></table>
          </div>
          <div className="card">
            <h2>ロケーション（R-01）</h2>
            <table><thead><tr><th>ロケーション</th><th>ゾーン</th><th>温度帯</th><th>隔離区画</th></tr></thead>
              <tbody>{data.locations.map((l: any) => (<tr key={l.location_id}><td>{l.location_id}</td><td>{l.zone}</td><td>{BAND[l.temp_band]}</td><td>{l.is_quarantine ? 'Q' : ''}</td></tr>))}</tbody></table>
          </div>
          <div className="mock">モック: マスターの編集・承認ワークフロー（created→review→active→retired）は未実装。SQLで投入した参照データのみ。</div>
        </>
      )}
    </>
  );
}
