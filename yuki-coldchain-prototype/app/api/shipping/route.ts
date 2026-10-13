import { route, getCtx, check } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  const [orders, checks] = await Promise.all([
    supabase.from('orders').select('*, customers(name_ja), skus(name_ja, temp_band), lot:lots!allocated_lot_id(lot_id, expiry_date)').in('status', ['allocated', 'shipped']).order('order_id'),
    supabase.from('dispatch_checks').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  return { orders: check(orders), checks: check(checks) };
});
