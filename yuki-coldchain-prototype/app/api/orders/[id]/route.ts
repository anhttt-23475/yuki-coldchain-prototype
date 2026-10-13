import { route, getCtx } from '@/lib/api';
import { evaluateOrder } from '@/lib/allocation';
export const dynamic = 'force-dynamic';

export const GET = route(async (_req, p) => {
  const { supabase } = await getCtx();
  return evaluateOrder(supabase, p.id);
});
