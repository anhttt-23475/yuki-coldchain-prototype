import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export class HttpError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body: any = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function getCtx() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, 'ログインが必要です | Login required');
  return { supabase, actor: user.email ?? user.id };
}

export function check<T>(res: { data: T; error: any }): T {
  if (res.error) throw new HttpError(500, res.error.message);
  return res.data;
}

export function route(fn: (req: Request, params: any) => Promise<any>) {
  return async (req: Request, ctx: { params: any }) => {
    try {
      const out = await fn(req, ctx?.params ?? {});
      return NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, ...e.body }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
    }
  };
}
