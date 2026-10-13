# Yuki Cold Chain – Prototype (LAB-2, Product B)

食品コールドチェーン業務支援システム のプロトタイプ。架空顧客「ユキコールドロジスティクス株式会社」の RFP（YCL-RFP-2026-01 v2.0）をもとに、LAB-1 の画面一覧・Feature list・User story から主要画面を実装したもの。

**Stack:** Next.js 14 (App Router, API routes) · Supabase (Postgres + Auth) · Vercel

## リンク | Links

| | |
|---|---|
| アプリURL (Vercel) | `https://yuki-coldchain-prototype-mu.vercel.app` |
| Supabase project | https://supabase.com/dashboard/project/rpubuvtkzovywefffabw |
| 画面・機能一覧（確定版）＋モック一覧 | [docs/SCOPE.md](docs/SCOPE.md) |

## デモアカウント | Tài khoản demo

| Email | Password |
|---|---|
| `<truong.thi.thu.anh@sun-asterisk.com>` | `<Lab2@2026>` |

アカウントは LAB-6 終了まで有効にしておきます。| Tài khoản giữ đến hết LAB-6.

> ⚠ **DB接続エラーが出たら | Nếu báo lỗi kết nối DB:** Supabase の無料プロジェクトは一定期間アクセスがないと一時停止します。Supabase ダッシュボードでプロジェクトを開き **「Resume project」** を押してください（数分で復帰）。
> Project Supabase gói free sẽ tạm dừng nếu lâu không dùng → vào dashboard bấm **Resume project**, đợi vài phút rồi tải lại trang.

## デモの流れ | Kịch bản demo (dữ liệu theo fixture RFP)

業務日（デモ用の固定日付）は **2026-09-15**（`NEXT_PUBLIC_BUSINESS_DATE`）。

1. **ORD-001** – CUS-003 × CHI-002: 期限 2026-09-18 のロット L-0007 は **日付逆転禁止** で除外（前回 SH-0001 で期限 09-20 を受領済み）。今日との比較ではない。
2. **ORD-003** – 消費期限が業務日に到達した L-0009 は例外なくブロック（賞味期限はアラートのみ）。
3. **ORD-002 / ORD-005** – 配送ウィンドウ未確定（AGR-014 / AGR-008）→ 推論せず **business-review**。理由入力で手動引当。
4. **ORD-004** – 2分の1ルールの納品期限を過ぎた L-0005 を除外し、次の FEFO 候補 L-0006 を選択。
5. **入荷検品** – 冷蔵SKUを 7°C で登録 → 自動隔離＋逸脱作成。牛は個体識別番号が10桁でないとブロック。
6. **出荷前チェック** – 車両温度がポリシー外なら出荷ブロック＋逸脱作成。OKなら配送履歴に登録（次回の日付逆転チェックに使用）。
7. **温度アラーム** – CSV取込（SHA-256で二重取込防止、行番号付きエラー）→ アラーム→逸脱→関連ロット隔離→根拠付きクローズ。
8. **配車** – RT-002（連続運転4h30m）、RT-003（拘束14h05m）は公開不可。RT-001 は公開可（ルール版にバインド）。
9. **トレース** – `1234567890`（牛）、`新潟県`（米）、`LEGACY`（上流データなし＝リンク終端）。

デモデータを初期状態に戻すには `supabase/setup.sql` を SQL Editor で再実行。| Muốn reset dữ liệu demo: chạy lại `supabase/setup.sql`.

## ローカル実行 | Chạy local

```bash
npm install
cp .env.local.example .env.local   # Supabase > Project Settings > API の URL と anon/publishable key を記入
npm run dev                         # http://localhost:3000
npm run test:rules                  # ルールエンジンの単体テスト（RFP fixture）
```

`.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://rpubuvtkzovywefffabw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
NEXT_PUBLIC_BUSINESS_DATE=2026-09-15
```

## データベース初期化 | Khởi tạo DB

Supabase ダッシュボード → **SQL Editor** → `supabase/setup.sql` の内容を貼り付けて **Run**。テーブル作成・RLS（ログインユーザーのみ読み書き可）・引当用DB関数・サンプルデータ投入まで一括で行う。

## 構成 | Cấu trúc

```
middleware.ts            未ログインは /login へリダイレクト、API は 401
app/login                ログイン（Supabase Auth, email+password）
app/(app)/*              各画面（クライアントから /api/* を呼ぶ）
app/api/*                Next.js API routes → Supabase（読み書き）
lib/rules.ts             業務ルール（消費期限→温度帯→隔離→配送ウィンドウ→日付逆転→FEFO/FIFO、拘束時間、温度評価）
lib/allocation.ts        受注ごとの候補ロット評価
supabase/setup.sql       スキーマ＋RLS＋DB関数（原子的引当 allocate_lot / 出荷 ship_order）＋サンプルデータ
scripts/test-rules.ts    ルールのテスト
```

## セキュリティ上の注意

- 全テーブル RLS 有効。`authenticated` ロールのみアクセス可（匿名キーだけではデータを読めない）。
- ロール別権限（品質管理者・配送計画者など）、maker-checker は未実装（デモユーザー1名）。詳細は docs/SCOPE.md。
- サンプルデータはすべて架空（RFP fixture ベース）。実データは含まない。
