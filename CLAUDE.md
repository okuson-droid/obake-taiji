# CLAUDE.md

お化け退治ボードゲームのブラウザ版。GitHub Pages で公開し、オンライン同期に Supabase を使う。

## 文書
- docs/rules.md：ルール（現在 v0.1）。条項番号でテストと対応づける。
- docs/design.md：実装設計書。構成・API・プロトコル・段階はここに従う。
- 設計文書の正は claude.ai プロジェクトにある。docs/ は写しであり、勝手に書き換えない。

## コマンド
- npm run dev：開発サーバー
- npm run typecheck：tsc --noEmit
- npm test：vitest run
- npm run build：dist/index.html を 1 枚で出力
- npm run e2e：Playwright の受け入れ検査

## 構成
- src/game：純粋関数のみ。src/ui・src/net を import しない。Math.random を使わない。
- src/data：カード・盤面の静的データ。
- src/ui：React。状態変更は src/game の関数呼び出しのみ。ルールを再実装しない。
- src/net：Room インターフェース、Supabase 実装、偽 DB。

## 守ること
- rules.md に定めがなく、合法手・得点・勝敗に影響する箇所は、推測で補わず作業を止めて報告する。
- 選択肢 ID・カード ID・乱数の消費順は通信プロトコルである（design.md §6）。変える場合は理由をここに残す。
- 他人の手札を画面と DOM に出さない。
- ロジックを変えるときは対応するテストを先に更新する。テストに rules の条項番号を書く。
- 型検査・テスト・ビルドが通らない状態で作業を完了扱いにしない。
- コードのコメントと文書は日本語の「である調」で書く。
- 新しいライブラリを入れる前に、理由を示して承認を得る。

## 配布
- main への push で GitHub Actions が CI を通した後に GitHub Pages へ公開する。
- Supabase の URL と publishable key はリポジトリの Variables から渡す。未設定ならオンライン対戦の入口を隠す。secret key は使わない。

## 既知の制約
- オンライン版の共有データには山札と手札が入るため、開発者ツールで覗ける（身内向けとして受け入れている）。
