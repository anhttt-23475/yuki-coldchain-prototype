import { route, getCtx, check, HttpError } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  return check(await supabase.from('orders').select('*, customers(name_ja), skus(name_ja, temp_band, expiry_type)').order('order_id'));
});

// FR-OUT-01: lỗi khi master chưa có
export const POST = route(async (req) => {
  const { supabase } = await getCtx();
  const b = await req.json();
  if (!b.customer_id || !b.sku_id || !b.requested_date || !(Number(b.qty) > 0)) throw new HttpError(400, '顧客・SKU・数量・納品要求日は必須です');
  const [c, s] = await Promise.all([
    supabase.from('customers').select('customer_id').eq('customer_id', b.customer_id).maybeSingle(),
    supabase.from('skus').select('sku_id').eq('sku_id', b.sku_id).maybeSingle(),
  ]);
  if (!check(c) || !check(s)) throw new HttpError(400, 'マスター未定義の顧客またはSKUです');
  const id = check(await supabase.rpc('next_id', { p_kind: 'order' })) as string;
  check(await supabase.from('orders').insert({ order_id: id, customer_id: b.customer_id, sku_id: b.sku_id, qty: Number(b.qty), requested_date: b.requested_date }));
  return { order_id: id };
});
