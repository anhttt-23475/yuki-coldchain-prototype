import { route, getCtx } from '@/lib/api';
import { BUSINESS_DATE, addDays } from '@/lib/rules';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  const c = async (table: string, f: (q: any) => any) => {
    const r = await f(supabase.from(table).select('*', { count: 'exact', head: true }));
    if (r.error) throw r.error;
    return r.count ?? 0;
  };
  const [quarantine, alarms, deviations, toAllocate, review, toShip, nearExpiry] = await Promise.all([
    c('lots', (q) => q.eq('status', 'quarantine')),
    c('temperature_readings', (q) => q.eq('evaluation', 'alarm').is('reviewed_at', null)),
    c('deviations', (q) => q.neq('status', 'closed')),
    c('orders', (q) => q.eq('status', 'created')),
    c('orders', (q) => q.eq('status', 'business_review')),
    c('orders', (q) => q.eq('status', 'allocated')),
    c('lots', (q) => q.eq('status', 'available').lte('expiry_date', addDays(BUSINESS_DATE, 3))),
  ]);
  return { businessDate: BUSINESS_DATE, quarantine, alarms, deviations, toAllocate, review, toShip, nearExpiry };
});
