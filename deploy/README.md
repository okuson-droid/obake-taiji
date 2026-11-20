# オンライン対戦の準備手順（Supabase と GitHub）

この文書は、オンライン対戦を公開版で使えるようにするための準備手順である。正の手順書は claude.ai プロジェクトの setup.md であり、この文書は第 5 段階で Claude Code が設計書（design.md §7.4・§10）と決定記録（decisions.md D-06・D-08・D-09）をもとに書いた案である。setup.md と食い違う場合は setup.md に合わせて直す。

Supabase と GitHub の画面の名前は変わることがある。見つからない場合は、近い名前の項目を探す。

## 0. 全体の流れ

1. Supabase のプロジェクトを作る。
2. `deploy/supabase.sql` を実行して、テーブル・関数・権限を作る。
3. 匿名ログインを有効にする。
4. Project URL と publishable key を控える。
5. GitHub のリポジトリの Variables に登録する。
6. 公開をやり直し、トップに「オンラインで遊ぶ」が出ることを確かめる。

## 1. Supabase のプロジェクトを作る

1. https://supabase.com にログインし、New project を選ぶ。
2. 名前は `obake-taiji` など任意でよい。Region は利用者に近い場所（日本なら Northeast Asia (Tokyo)）を選ぶ。
3. データベースのパスワードは、このゲームでは使わない。控えておくだけでよい。リポジトリやチャットには書かない。

## 2. テーブル・関数・権限を作る

1. 左のメニューの SQL Editor を開き、New query を選ぶ。
2. このリポジトリの `deploy/supabase.sql` の内容をすべて貼り付け、Run を押す。
3. 次のものができる。
   - `rooms` テーブル（1 ゲーム＝1 行）。行単位のセキュリティ（RLS）を有効にし、読み取りはログイン済みの利用者に、作成は作成者本人に限る。
   - `write_room` 関数。更新はこの関数に限り、版の一致と、対局中は書き込み者が着席していることを検査する（D-06）。
   - `clear_room` 関数。作成者だけが部屋を消せる。
   - Realtime の配信対象への `rooms` の追加。
4. 2 回目以降に実行すると「すでにある」というエラーになる。作り直す場合は、Table Editor で `rooms` を消してから実行する。

## 3. 匿名ログインを有効にする

1. Authentication → Sign In / Providers（または Providers）を開く。
2. Allow anonymous sign-ins（匿名ログイン）を有効にして保存する。
3. 遊ぶ人はアカウントを作らない。各端末に匿名の利用者が作られ、ブラウザに保存される。再読み込みしても同じ席に戻れる。
4. 匿名ログインを悪用した大量登録が気になる場合は、Authentication の設定で CAPTCHA や回数の上限を検討する（身内で遊ぶ前提のため、初期状態では設定しない）。

## 4. Project URL と publishable key を控える

1. Project Settings → API Keys（または Data API）を開く。
2. 次の 2 つを控える。
   - Project URL（`https://xxxx.supabase.co` の形）
   - Publishable key（`sb_publishable_` で始まる鍵）
3. secret key（`sb_secret_` で始まる鍵）と、レガシーの anon key・service_role key は使わない（D-09）。secret key はどこにも貼らない。
4. publishable key はブラウザに公開してよい低権限の鍵である。守りは RLS と `write_room` 関数が担う。

## 5. GitHub の Variables に登録する

1. GitHub のリポジトリ `okuson-droid/obake-taiji` の Settings → Secrets and variables → Actions を開く。
2. Variables のタブ（Secrets ではない）で New repository variable を選び、次の 2 つを登録する。

   | 名前 | 値 |
   |---|---|
   | `SUPABASE_URL` | 手順 4 の Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | 手順 4 の Publishable key |

3. `deploy.yml` がビルドのときに、これらを `VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY` として埋め込む。値が空なら、オンライン対戦の入口は隠れる（D-08）。

## 6. 公開をやり直して確かめる

1. GitHub の Actions → Deploy を開き、Run workflow で手動で実行する（main への push でも実行される）。
2. 公開版（https://okuson-droid.github.io/obake-taiji/）を開き、トップに「オンラインで遊ぶ」が出ることを確かめる。
3. 1 台目で名前を入れて「部屋を作る」を押し、表示された招待リンクを 2 台目で開く。2 台目で名前を入れて「この部屋に座る」を押す。
4. 全席がそろったら、1 台目で「開始する」を押す。それぞれの端末で自分の番だけ操作でき、相手の操作がすぐに反映されることを確かめる。

## うまく動かないとき

- 「オンラインで遊ぶ」が出ない：Variables の名前の綴りと、Deploy を実行し直したかを確かめる。
- 「接続できませんでした」と出る：匿名ログインが有効か（手順 3）、publishable key が正しいかを確かめる。
- 部屋は作れるが、相手の操作が反映されない：`deploy/supabase.sql` の最後の行（Realtime への追加）が実行されたかを、Database → Publications の `supabase_realtime` で確かめる。
- 「ほかの操作と重なったため、最新の状態に戻しました」と出る：2 か所から同時に書き込んだため、後の書き込みを捨てた。もう一度選べばよい（design.md §7.3 の 4.）。

## 片付け

- 終局後、作成者は「部屋を片付ける」で部屋を消せる。
- 消されずに残った古い部屋は、SQL Editor で次のように消せる。

  ```sql
  delete from public.rooms where updated_at < now() - interval '7 days';
  ```

## 既知の制約

- 共有ドキュメントには山札と全員の手札が入るため、開発者ツールで他人の手札を覗ける。身内で遊ぶ前提で受け入れている（D-05）。画面と DOM には他人の手札を出さない。
- 不正な手（ルール違反）はサーバーでは検査しない。各ブラウザが `replay` で弾く（D-06）。
