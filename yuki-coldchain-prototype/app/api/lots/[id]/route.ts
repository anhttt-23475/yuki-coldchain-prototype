import { route, getCtx, check } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async (_req, p) => {
  const { supabase } = await getCtx();
  const lot = check(await supabase.from('lots').select('*, skus(*), suppliers(name_ja), locations(*)').eq('lot_id', p.id).single());
  const [events, shipments, receipts] = await Promise.all([
    supabase.from('lot_events').select('*').eq('lot_id', p.id).order('created_at'),
    supabase.from('shipment_history').select('*, customers(name_ja)').eq('lot_id', p.id).order('completed_at'),
    supabase.from('receipts').select('*').eq('lot_id', p.id),
  ]);
  return { lot, events: check(events), shipments: check(shipments), receipts: check(receipts) };
});
