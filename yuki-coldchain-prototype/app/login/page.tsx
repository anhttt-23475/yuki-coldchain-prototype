'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError('ログインに失敗しました | Đăng nhập thất bại: ' + error.message);
    window.location.href = '/';
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>ログイン | Login</h1>
      <p className="lead">食品コールドチェーン業務支援システム（プロトタイプ）<br />Yuki Cold Logistics — LAB-2</p>
      <label>メールアドレス | Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      <div style={{ height: 12 }} />
      <label>パスワード | Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      {error && <div className="msg err">{error}</div>}
      <div style={{ height: 16 }} />
      <button disabled={busy} style={{ width: '100%' }}>{busy ? '...' : 'ログイン | Sign in'}</button>
      <p className="muted" style={{ marginTop: 16 }}>デモアカウントは README.md を参照 | Tài khoản demo xem README.md</p>
    </form>
  );
}
