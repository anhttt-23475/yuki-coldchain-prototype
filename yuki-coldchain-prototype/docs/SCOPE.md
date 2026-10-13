# 画面・機能一覧（LAB-2 確定版）＋ モック一覧
# Danh sách màn hình/tính năng bản chốt + phần mock

LAB-1 の画面一覧（49画面）・Feature list（64件）のうち、RFP の重大エラー条件（S5-03）と受入基準 ACC-* に直結する画面を優先して実装した。

## 1. 実装した画面（実データ：Supabase 読み書きあり）| Màn hình đã làm thật

| # | 画面 \| Màn hình | URL | LAB-1 画面ID | 主な Feature / 要件 | 実装内容（本物） |
|---|---|---|---|---|---|
| 1 | ログイン \| Login | `/login` | SCR-001 | FT-0101 | Supabase Auth（email/password）。未ログインは全画面・全APIアクセス不可（middleware + RLS） |
| 2 | ダッシュボード \| Dashboard | `/` | SCR-002 | — | 未引当・business-review・出荷待ち・未確認アラーム・逸脱・隔離・期限接近の件数をDB集計 |
| 3 | 入荷検品 \| Receiving | `/receiving` | SCR-021 | FT-0302/0304/0305, FR-REC-02/04/05, BR-TRACE-01/02 | P0項目必須（不足項目を個別表示）、期限種別のSKUマスター照合、温度帯外/梱包NG→自動隔離＋逸脱作成、牛10桁・米産地必須、ロット採番 |
| 4 | 在庫・ロット照会 \| Inventory | `/inventory` | SCR-030 | FT-0405 | FEFO順、残日数、状態、温度帯不一致の警告 |
| 5 | ロット詳細・状態変更 \| Lot detail | `/inventory/[id]` | SCR-035 | FT-0404, FR-INV-05 | 有効な遷移のみ（available→quarantine→available/scrapped）、理由必須、追記のみの状態履歴、出荷先 |
| 6 | 受注一覧・登録 \| Orders | `/orders` | SCR-040 | FT-0601 | 受注登録（マスター未定義はエラー） |
| 7 | 引当判定 \| Allocation | `/orders/[id]` | SCR-041 | FT-0501〜0505, BR-EXP-01/02, BR-TEMP-02, BR-DELWIN-01, BR-DATE-01, BR-FEFO-01, FR-OUT-02 | 除外順序（①消費期限 ②温度帯 ③隔離 ④配送ウィンドウ ⑤日付逆転）→ FEFO/FIFO。全候補の判定理由を表示。未確定ルールは business-review。DB関数で原子的に在庫減算（過剰引当防止）。判定ログ |
| 8 | 出荷前チェック \| Pre-shipment | `/shipping` | SCR-044 | FT-0604, FR-OUT-05 | 車両温度帯・車両/貨物温度・シール。ポリシー外→ブロック＋逸脱。OK→配送履歴登録（日付逆転の比較元になる） |
| 9 | 温度アラーム・CSV取込 \| Temperature | `/temperature` | SCR-070/072 | FT-0901〜0903, FR-TEMP-01〜03 | CSV取込（SHA-256で二重取込防止、行番号付きエラー）、ポリシー版で評価、アラーム→逸脱自動作成、15分SLA表示、初回レビュー記録 |
| 10 | 逸脱ケース \| Deviations | `/deviations` | SCR-073 | FT-0904, FR-TEMP-04 | 関連ロット隔離、判定（disposition）＋根拠＋添付確認なしではクローズ不可 |
| 11 | 配車・拘束時間 \| Dispatch | `/dispatch` | SCR-061/062 | FT-0803/0805, FR-SCH-02/04 | 連続運転4h（30分以上の休憩でリセット、荷役は休憩扱いしない）・1日拘束13hを判定、違反時間帯を表示、違反ありは公開禁止、公開時にルール版をバインド |
| 12 | トレース検索 \| Traceability | `/trace` | SCR-080 | FT-1001/1002, FR-TRC-01 | ロット/仕入先ロット/牛個体識別番号/米産地/SKUで検索、上流（仕入先）〜下流（出荷先）、リンク終端の明示 |
| 13 | マスター（参照）\| Masters | `/masters` | SCR-010/011/013 | FT-0201〜0203 | 温度ポリシー・SKU（R-02）・顧客×SKU契約（R-04、未確定行は「未確定」表示）・ロケーション |

**API routes（Next.js → Supabase）:** `/api/dashboard, masters, receipts, lots, lots/[id], lots/[id]/status, orders, orders/[id], orders/[id]/allocate, shipping, shipping/[id], temperature, temperature/import, temperature/[id]/review, deviations, deviations/[id], trace, routes, routes/[id]/publish`

## 2. モック（簡略化）した部分 | Phần mock

| 対象 | 現在のモック | 本番で必要なこと |
|---|---|---|
| サンプルデータ | `supabase/setup.sql` の架空データ（RFP fixture ベース） | 移行（S4-01：プロファイリング、2回リハーサル、lineage） |
| 業務日 | `NEXT_PUBLIC_BUSINESS_DATE=2026-09-15` 固定（SLA は業務日＋実時刻JST） | 実時刻・JSTタイムゾーン運用 |
| 写真・バーコード | 写真は「撮影済み」チェック、ロット・シールは手入力 | ハンディ端末カメラ・スキャナ連携、画像ハッシュ保存（DR-POD-01） |
| ロガー連携 | CSVテキスト貼付け | 管理されたファイルアップロード（IF-LOG-01）、SFTP |
| 温度アラーム時の隔離 | 逸脱画面のボタンで関連ロットを隔離 | RFP通りアラーム発生時に自動隔離 |
| 権限 | デモユーザー1名、全操作可 | ロール別RBAC、起票者/承認者分離（NFR-SEC-02）、MFA |
| 逸脱の承認・添付 | 添付は「添付済み」チェック、重大度別ロールなし | 添付ファイル保存、重大度×役割の承認フロー（Q-07） |
| 配車 | ルート（運転・荷役・休憩の分数）はシードデータ、判定と公開のみ | ルート作成UI、地図サービス（IF-MAP-01）、休憩自動挿入、年960h/月284h等の長期集計 |
| 配送ウィンドウ計算 | 製造日起点・比率・切り捨て（Q-09の前提） | 顧客回答で式を確定 |
| ERP / メール | なし（受注は画面入力） | IF-ERP-01（SFTP CSV）、IF-MAIL-01 |

## 3. 範囲外とした画面 | Ngoài phạm vi (so với LAB-1)

| LAB-1 画面 | 理由 |
|---|---|
| SCR-003/004/005 ユーザー・承認待ち・監査ログ | 認証は実装済み。RBAC・承認ワークフローは工数大のためLAB-2では対象外 |
| SCR-012/014/015 仕入先・デバイス・ポリシー編集 | 参照のみで業務フローは成立。編集・承認はマスター管理機能として後続 |
| SCR-020/022/023 入荷予約・差異承認・一時温度帯 | P1要件。入荷検品（P0）を優先 |
| SCR-031〜034 put-away・移動・棚卸 | 在庫の状態変更（隔離/解除/廃棄）を優先。棚卸は P1 |
| SCR-042/043 ピッキング・積込検証 | スキャナ前提のため、出荷前チェックで温度・シール検証を代替 |
| SCR-050〜054 ドライバー端末・POD・クレーム | オフライン暗号化キューとPOD画像は端末実機が必要。今回は対象外と明記 |
| SCR-060/063 ルート作成・事象記録 | 拘束時間チェックと公開制御（重大エラー条件）を優先 |
| SCR-074 HACCP 完全性レビュー | 温度アラーム・逸脱を優先 |
| SCR-081/082 リコールケース・通知 | トレース検索のみ実装 |
| SCR-090〜095 レポート・KPI・監査export・連携監視・移行 | ダッシュボード集計のみ |
