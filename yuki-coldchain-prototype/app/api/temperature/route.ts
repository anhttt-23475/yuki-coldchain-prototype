import { route, getCtx, check } from '@/lib/api';
import { businessNow } from '@/lib/rules';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  const [readings, batches] = await Promise.all([
    supabase.from('temperature_readings').select('*').order('read_at', { ascending: false }).limit(100),
    supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  return { readings: check(readings), batches: check(batches), now: businessNow().toISOString() };
});
