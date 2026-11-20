// オンライン対戦の画面（design.md §7.3・§7.5）。部屋の共有ドキュメントを購読し、ロビーと対局を出す。
// 局面は replay(checkpoint, moves) で作り、viewer は自分の席に固定する。書き込むのは選択待ちの席の人だけである。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { explain } from '../game/explain.ts';
import type { Target } from '../game/targets.ts';
import type { GameState, MoveCardId, OptionId } from '../game/types.ts';
import { connect, fakeDbRequested } from '../net/index.ts';
import type { Connection, RoomDoc } from '../net/room.ts';
import { applyChoice, canStart, docState, joinSeat, seatOf, startGame, undoChoice } from '../net/roomDoc.ts';
import { planAnimation } from './animation.ts';
import { seatColor, seatName } from './labels.ts';
import { GameScreen, Result, Watching, prefersReducedMotion, type Playing } from './LocalGame.tsx';

type Snapshot = { doc: RoomDoc | null; version: number };

export const OnlineRoom = ({ code }: { code: string }) => {
  const [conn, setConn] = useState<Connection | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let alive = true;
    connect(code)
      .then((c) => {
        if (!alive) return;
        setConn(c);
        stop = c.room.subscribe((doc, version) => {
          // 古い版は捨てる。部屋が消えたとき（版 0）は受け入れる。
          setSnap((prev) => (prev !== null && version !== 0 && version <= prev.version ? prev : { doc, version }));
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      stop?.();
    };
  }, [code]);

  if (error !== null) return <Notice title="接続できませんでした" text={error} />;
  if (conn === null || snap === null) return <Notice title={`部屋 ${code}`} text="接続しています…" />;
  if (snap.doc === null) return <Notice title={`部屋 ${code}`} text="この部屋は見つかりません。部屋コードを確かめてください。" />;
  const accept = (doc: RoomDoc, version: number) =>
    setSnap((prev) => (prev !== null && version <= prev.version ? prev : { doc, version }));
  if (snap.doc.status === 'lobby') return <Lobby code={code} conn={conn} doc={snap.doc} version={snap.version} accept={accept} />;
  return <OnlineGame code={code} conn={conn} doc={snap.doc} version={snap.version} accept={accept} />;
};

const Notice = ({ title, text }: { title: string; text: string }) => (
  <main className="result" data-testid="online-notice">
    <h1>{title}</h1>
    <p>{text}</p>
    <a className="action" href="#/" data-testid="back-to-top">
      トップへ戻る
    </a>
  </main>
);

type RoomProps = { code: string; conn: Connection; doc: RoomDoc; version: number; accept: (doc: RoomDoc, version: number) => void };

/** 招待用のリンク（design.md §7.5）。偽 DB の指定などのクエリは引き継ぐ。 */
const inviteUrl = (code: string): string => window.location.href.replace(/#.*$/, '') + `#/room/${code}`;

const Lobby = ({ code, conn, doc, version, accept }: RoomProps) => {
  const mine = seatOf(doc, conn.uid);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = inviteUrl(code);

  const join = async () => {
    if (name.trim() === '') return;
    setBusy(true);
    try {
      await conn.room.transact((d) => (d === null ? d : joinSeat(d, conn.uid, name)));
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setBusy(true);
    const next = startGame(doc);
    const r = await conn.room.write(next, version);
    if (r.ok) accept(next, r.version);
    setBusy(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('リンクをコピーしました');
    } catch {
      setCopied('コピーできませんでした。リンクを長押しして選んでください');
    }
  };

  return (
    <main className="top lobby" data-testid="lobby">
      <h1>部屋 {code}</h1>
      <section className="top-section">
        <h2>招待</h2>
        <p className="invite" data-testid="invite-url">
          {url}
        </p>
        <button type="button" className="action" onClick={copy} data-testid="copy-invite">
          リンクをコピー
        </button>
        {copied !== null && <p className="muted">{copied}</p>}
      </section>
      <section className="top-section">
        <h2>席（{doc.config.players} 人）</h2>
        <ul className="seats">
          {doc.seats.map((s, i) => (
            <li key={i} className={i === mine ? 'seat current' : 'seat'} data-testid={`lobby-seat-${i + 1}`}>
              <span className="seat-name">
                <span className="dot" style={{ background: seatColor(i) }} />
                {seatName(i)}
              </span>
              <span>{s === null ? '空席' : s.name}</span>
              {i === mine && <span className="turn-mark">あなた</span>}
              {s !== null && s.uid === doc.host && <span className="muted">作成者</span>}
            </li>
          ))}
        </ul>
        {mine === null && doc.seats.includes(null) && (
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <label htmlFor="join-name">名前</label>
            <input id="join-name" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} data-testid="join-name" required />
            <button type="submit" className="action" disabled={busy || name.trim() === ''} data-testid="join-room">
              この部屋に座る
            </button>
          </form>
        )}
        {mine === null && !doc.seats.includes(null) && <p>この部屋は満席です。</p>}
        {canStart(doc, conn.uid) ? (
          <button type="button" className="action start" onClick={start} disabled={busy} data-testid="start-online">
            開始する
          </button>
        ) : (
          mine !== null && <p className="muted">{doc.seats.includes(null) ? '全員がそろうのを待っています' : '作成者が開始するのを待っています'}</p>
        )}
      </section>
    </main>
  );
};

const OnlineGame = ({ code, conn, doc, version, accept }: RoomProps) => {
  const mine = seatOf(doc, conn.uid);
  const state = useMemo((): GameState | null | 'invalid' => {
    try {
      return docState(doc);
    } catch {
      return 'invalid';
    }
  }, [doc]);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreviewState] = useState<MoveCardId | null>(null);
  const previewRef = useRef<MoveCardId | null>(null);
  const setPreview = (card: MoveCardId | null) => {
    previewRef.current = card;
    setPreviewState(card);
  };
  const busy = useRef(false);

  // 局面が変わったら、その変化の演出を再生する（自分の手も他人の手も同じ道筋で見せる）。
  const [playing, setPlaying] = useState<Playing | null>(null);
  const prevState = useRef<GameState | null>(null);
  const playCount = useRef(0);
  useLayoutEffect(() => {
    if (state === null || state === 'invalid') return;
    const prev = prevState.current;
    prevState.current = state;
    if (prev === null || mine === null || prefersReducedMotion()) return;
    const plan = planAnimation(prev, state);
    if (plan !== null) {
      playCount.current += 1;
      setPlaying({ plan, viewer: mine, id: playCount.current });
    }
  }, [state, mine]);
  useEffect(() => {
    if (playing === null) return;
    const timer = window.setTimeout(() => setPlaying(null), playing.plan.total);
    return () => window.clearTimeout(timer);
  }, [playing]);

  // 偽 DB の同期検査では、全ページの最終局面が一致することを確かめるために局面を公開する（design.md §9.3）。
  useEffect(() => {
    if (fakeDbRequested() && state !== null && state !== 'invalid') window.__obakeState = JSON.stringify(state);
  }, [state]);

  const send = async (next: RoomDoc | null) => {
    if (next === null || busy.current) return;
    busy.current = true;
    try {
      const r = await conn.room.write(next, version);
      // 版が食い違ったら、手元の変更を捨てて最新の doc で描き直す。自動ではやり直さない（design.md §7.3 の 4.）。
      if (r.ok) accept(next, r.version);
      else setMessage('ほかの操作と重なったため、最新の状態に戻しました');
    } finally {
      busy.current = false;
    }
  };

  if (state === 'invalid') return <Notice title={`部屋 ${code}`} text="部屋の記録に不正な手が含まれているため、表示できません。" />;
  if (state === null) return <Notice title={`部屋 ${code}`} text="ゲームを準備しています…" />;
  if (mine === null) return <Notice title={`部屋 ${code}`} text="この部屋の対局はすでに始まっています。観戦はできません。" />;

  const session = { checkpoint: doc.checkpoint!, moves: doc.moves, log: [...doc.checkpoint!.events] };
  if (playing !== null) {
    return <Watching key={playing.id} session={session} state={state} playing={playing} onSkip={() => setPlaying(null)} />;
  }
  if (state.result !== null) {
    return (
      <Result state={state}>
        <ul className="names" data-testid="online-names">
          {doc.seats.map((s, i) => (
            <li key={i}>
              {seatName(i)}：{s?.name ?? ''}
            </li>
          ))}
        </ul>
        {doc.host === conn.uid && (
          <button type="button" className="action" onClick={() => void conn.room.clear()} data-testid="clear-room">
            部屋を片付ける
          </button>
        )}
      </Result>
    );
  }
  const pending = state.pending!;
  const active = pending.player === mine;
  return (
    <>
      <p className="online-bar" data-testid="online-bar">
        部屋 {code}・あなたは {seatName(mine)}（{doc.seats[mine]?.name}）
      </p>
      <GameScreen
        session={session}
        state={state}
        viewer={mine}
        active={active}
        message={message}
        preview={preview}
        previewRef={previewRef}
        setPreview={setPreview}
        act={(option: OptionId) => {
          setPreview(null);
          setMessage(null);
          void send(applyChoice(doc, conn.uid, option));
        }}
        showExplain={(target: Target) => setMessage(explain(state, mine, target))}
        onUndo={() => {
          setPreview(null);
          setMessage(null);
          void send(undoChoice(doc, conn.uid));
        }}
      />
    </>
  );
};
