// トップ画面（design.md §7.5）。オンライン対戦の入口は第 5 段階で作る。
// Supabase の環境変数がない間は入口を出さない（decisions.md D-08）。
import type { GameConfig } from '../game/types.ts';
import { localHash } from './route.ts';

export const Top = () => (
  <main className="top">
    <div className="top-hero">
      <svg className="top-art" viewBox="0 0 300 120" aria-hidden="true">
        <use href="#art-chip-normal" x={20} y={30} width={70} height={70} className="float" />
        <use href="#art-wraith" x={110} y={6} width={90} height={90} className="float slow" />
        <use href="#art-chip-golden" x={215} y={28} width={70} height={70} className="float" />
      </svg>
      <h1>お化け退治</h1>
      <p className="top-sub">古い洋館に、今夜もお化けが出る。燭台を手に、10 点ぶん捕まえよう。</p>
    </div>
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
