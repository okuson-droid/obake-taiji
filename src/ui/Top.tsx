// トップ画面（design.md §7.5）。ローカル対戦の入口と、オンライン対戦の入口（部屋を作る・部屋に入る）を出す。
// オンライン対戦の入口は、Firebase の設定がなければ隠す（decisions.md D-08 の考え方）。偽 DB（?db=fake）のときは出す。
import { useState } from 'react';
import type { GameConfig } from '../game/types.ts';
import { connect, fakeDbRequested, onlineAvailable } from '../net/index.ts';
import { ROOM_CODE, newRoomDoc, randomRoomCode } from '../net/roomDoc.ts';
import { localHash, parseSeed, randomSeed, roomHash } from './route.ts';

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
    {onlineAvailable() && <OnlineEntry />}
  </main>
);

const OnlineEntry = () => {
  const [players, setPlayers] = useState<GameConfig['players']>(2);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // 偽 DB の検査のときだけ、?seed= でシードを決められる。それ以外は crypto.getRandomValues で作る。
      const seed = (fakeDbRequested() ? parseSeed(new URLSearchParams(window.location.search).get('seed')) : null) ?? randomSeed();
      // 部屋コードが既存の部屋と重なったら作り直す。
      for (let i = 0; i < 3; i++) {
        const roomCode = randomRoomCode();
        const conn = await connect(roomCode);
        const r = await conn.room.write(newRoomDoc({ players }, seed, conn.uid, name), 0);
        if (r.ok) {
          window.location.hash = roomHash(roomCode);
          return;
        }
      }
      setError('部屋を作れませんでした。もう一度試してください');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const normalized = code.trim().toUpperCase();
  return (
    <section className="top-section" data-testid="online-entry">
      <h2>オンラインで遊ぶ</h2>
      <p>それぞれの端末から同じ部屋に入って遊びます。</p>
      <form
        className="create-room"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="player-buttons" role="radiogroup" aria-label="人数">
          {([2, 3, 4] as GameConfig['players'][]).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={players === n}
              className={players === n ? 'action chosen' : 'action'}
              onClick={() => setPlayers(n)}
              data-testid={`online-players-${n}`}
            >
              {n} 人
            </button>
          ))}
        </div>
        <label htmlFor="host-name">名前</label>
        <input id="host-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} required data-testid="host-name" />
        <button type="submit" className="action" disabled={busy || name.trim() === ''} data-testid="create-room">
          部屋を作る
        </button>
      </form>
      <form
        className="enter-room"
        onSubmit={(e) => {
          e.preventDefault();
          if (ROOM_CODE.test(normalized)) window.location.hash = roomHash(normalized);
        }}
      >
        <label htmlFor="room-code">部屋コード</label>
        <input id="room-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" data-testid="room-code" />
        <button type="submit" className="action" disabled={!ROOM_CODE.test(normalized)} data-testid="enter-room">
          部屋に入る
        </button>
      </form>
      {error !== null && <p className="message">{error}</p>}
    </section>
  );
};
