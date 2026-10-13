import { route, getCtx, check } from '@/lib/api';
import { checkRoute } from '@/lib/rules';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  const routes = check(await supabase.from('routes').select('*, route_legs(*)').order('route_id')) as any[];
  const rule = check(await supabase.from('driver_rules').select('*').order('effective_from', { ascending: false }).limit(1).single()) as any;
  return { rule, routes: routes.map((r) => ({ ...r, check: checkRoute(r.start_time.slice(0, 5), r.route_legs, rule) })) };
});
