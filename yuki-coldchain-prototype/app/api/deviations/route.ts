import { route, getCtx, check } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  return check(await supabase.from('deviations').select('*, temperature_readings(device_id, value_c, read_at)').order('created_at', { ascending: false }));
});
