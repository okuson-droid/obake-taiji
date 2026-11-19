// トップ画面（design.md §7.5）。オンライン対戦の入口は第 5 段階で作る。
// Supabase の環境変数がない間は入口を出さない（decisions.md D-08）。
import type { GameConfig } from '../game/types.ts';
import { localHash } from './route.ts';

export const Top = () => (
  <main className="top">
    <h1>お化け退治</h1>
    <section className="top-section">
      <h2>ローカルで遊ぶ</h2>
      <p>1 台の端末を順番に回して遊びます。人数を選んでください。</p>
      <div className="player-buttons">
        {([2, 3, 4] as GameConfig['players'][]).map((n) => (
          <a key={n} className="action" href={localHash(n)} data-testid={`start-local-${n}`}>
            {n} 人
          </a>
        ))}
      </div>
    </section>
  </main>
);
