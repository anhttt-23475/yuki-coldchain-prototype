import { route, getCtx, check } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const { supabase } = await getCtx();
  const u = new URL(req.url);
  let q = supabase.from('lots').select('*, skus(name_ja, temp_band, expiry_type, trace_lane), locations(temp_band, is_quarantine)').order('expiry_date');
  if (u.searchParams.get('status')) q = q.eq('status', u.searchParams.get('status'));
  if (u.searchParams.get('sku')) q = q.eq('sku_id', u.searchParams.get('sku'));
  return check(await q);
});
