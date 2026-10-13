import { route, getCtx, check, HttpError } from '@/lib/api';
import { businessNow } from '@/lib/rules';
export const dynamic = 'force-dynamic';

// FR-TEMP-03: ghi thời điểm review lần đầu (không ghi đè)
export const POST = route(async (_req, p) => {
  const { supabase, actor } = await getCtx();
  const upd = check(await supabase.from('temperature_readings').update({ reviewed_at: businessNow().toISOString(), reviewed_by: actor }).eq('id', p.id).is('reviewed_at', null).select()) as any[];
  if (!upd.length) throw new HttpError(409, '既にレビュー済みです');
  return upd[0];
});
