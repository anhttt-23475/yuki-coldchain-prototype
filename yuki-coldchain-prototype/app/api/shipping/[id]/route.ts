import { route, getCtx, check, HttpError } from '@/lib/api';
import { evaluateTemp, BAND_LABEL } from '@/lib/rules';
export const dynamic = 'force-dynamic';

// 出荷前チェック (FR-OUT-05) + 温度帯照合 (BR-TEMP-02): ngoài chính sách → chặn xuất + tạo sai lệch
export const POST = route(async (req, p) => {
  const { supabase, actor } = await getCtx();
  const b = await req.json();
  if (!b.vehicle_band || b.vehicle_temp_c === '' || b.cargo_temp_c === '' || !String(b.seal_no ?? '').trim())
    throw new HttpError(400, '車両温度帯・車両温度・貨物温度・シール番号は必須です');
  const order = check(await supabase.from('orders').select('*, skus(temp_band)').eq('order_id', p.id).single()) as any;
  if (order.status !== 'allocated') throw new HttpError(409, '引当済みの受注のみ出荷できます');
  const band = order.skus.temp_band;
  const policy = check(await supabase.from('temp_policies').select('*').eq('band', band).single()) as any;
  const reasons: string[] = [];
  if (b.vehicle_band !== band) reasons.push(`車両温度帯 ${BAND_LABEL[b.vehicle_band]} ≠ SKU温度帯 ${BAND_LABEL[band]}`);
  if (evaluateTemp(Number(b.vehicle_temp_c), policy) === 'alarm') reasons.push(`車両温度 ${b.vehicle_temp_c}°C がポリシー外`);
  if (evaluateTemp(Number(b.cargo_temp_c), policy) === 'alarm') reasons.push(`貨物温度 ${b.cargo_temp_c}°C がポリシー外`);
  if (reasons.length) {
    check(await supabase.from('dispatch_checks').insert({
      order_id: p.id, vehicle_band: b.vehicle_band, vehicle_temp_c: Number(b.vehicle_temp_c), cargo_temp_c: Number(b.cargo_temp_c),
      seal_no: b.seal_no, result: 'blocked', reasons: reasons.join(' / '), actor,
    }));
    const devId = check(await supabase.rpc('next_id', { p_kind: 'deviation' })) as string;
    check(await supabase.from('deviations').insert({ deviation_id: devId, source: 'SHIPPING', lot_ids: [order.allocated_lot_id], description: `出荷前チェック ${p.id}: ${reasons.join(' / ')}` }));
    throw new HttpError(422, '出荷確認をブロックしました', { reasons, deviation_id: devId });
  }
  const r = await supabase.rpc('ship_order', {
    p_order_id: p.id, p_vehicle_band: b.vehicle_band, p_vehicle_temp: Number(b.vehicle_temp_c), p_cargo_temp: Number(b.cargo_temp_c), p_seal: b.seal_no, p_actor: actor,
  });
  if (r.error) throw new HttpError(409, r.error.message);
  return { shipment_id: r.data };
});
