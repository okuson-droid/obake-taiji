// ローカル対戦の画面（design.md §8、decisions.md U-01〜U-06）。
// 局面は session.ts（チェックポイント＋選択肢 ID の列）で持つ。判定は src/game の関数だけで行う。
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MOVE_CARD_BY_ID } from '../data/cards.ts';
import { getOptions } from '../game/engine.ts';
import { explain } from '../game/explain.ts';
import { deckCounts, previewHumanMove, scoreOf } from '../game/queries.ts';
import { targetOf, type Target } from '../game/targets.ts';
import type { GameConfig, GameState, MoveCardId, OptionId, Seat } from '../game/types.ts';
import { maskEvents } from '../game/visibility.ts';
import { CardFace } from './assets/art.tsx';
import { Board, type BoardPreview } from './Board.tsx';
import { eventText } from './eventText.ts';
import { GESTURES, areaOf, type Area } from './gestures.ts';
import { cardFullName, seatColor, seatName } from './labels.ts';
import { allEvents, canUndo, choose, currentState, startSession, undo, type Session } from './session.ts';

/** 出来事のログに表示する件数。古い順に並べ、末尾が最新である。 */
const LOG_LINES = 12;

const PROMPTS: Readonly<Record<NonNullable<GameState['pending']>['kind'], string>> = {
  overlapChoice: 'お化けがすべて怨霊の部屋にいます。どうするか選んでください',
  playCard: '使うカードを選んでください',
  ghostTarget: '動かすお化けか怨霊を、盤上でタップしてください',
  barrierTarget: '通せん棒を置く辺（緑）か、取り除く通せん棒（赤）をタップしてください',
  penaltyChip: '怨霊に触れました。失うお化けを情報欄でタップしてください',
};

/** 安全網の数を 1 つの局面について 1 回だけ数えるための鍵 */
const stateKey = (s: Session): string => `${s.checkpoint.turnNo}:${s.checkpoint.rng}:${s.moves.join(',')}`;

export const LocalGame = ({ players, seed }: { players: GameConfig['players']; seed: number }) => {
  const [session, setSession] = useState(() => startSession({ players }, seed));
  const state = useMemo(() => currentState(session), [session]);
  const viewer: Seat | null = state.pending?.player ?? null;
  const [revealedFor, setRevealedFor] = useState<Seat | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreviewState] = useState<MoveCardId | null>(null);
  // ホバーとタップが続けて届いても最新の値で判定できるよう、プレビュー中のカードを ref にも持つ。
  const previewRef = useRef<MoveCardId | null>(null);
  const setPreview = (card: MoveCardId | null) => {
    previewRef.current = card;
    setPreviewState(card);
  };

  const act = (option: OptionId) => {
    setPreview(null);
    setMessage(null);
    setSession((s) => choose(s, option));
  };
  const showExplain = (target: Target) => {
    if (viewer === null) return;
    setMessage(explain(state, viewer, target));
  };

  if (state.result !== null) return <Result state={state} />;
  if (viewer === null) return null;
  if (revealedFor !== viewer) {
    return (
      <main className="blind">
        <button type="button" className="blind-button" data-testid="blind-reveal" onClick={() => setRevealedFor(viewer)} style={{ borderColor: seatColor(viewer) }}>
          <svg className="blind-art" viewBox="0 0 100 100" aria-hidden="true">
            <use href="#art-player-front" x={0} y={0} width={100} height={100} color={seatColor(viewer)} />
          </svg>
          <span className="blind-seat" style={{ color: seatColor(viewer) }}>
            {seatName(viewer)} の番です。
          </span>
          <span>タップして手札を表示</span>
        </button>
      </main>
    );
  }

  return (
    <GameScreen
      session={session}
      state={state}
      viewer={viewer}
      message={message}
      preview={preview}
      previewRef={previewRef}
      setPreview={setPreview}
      act={act}
      showExplain={showExplain}
      onUndo={() => {
        setPreview(null);
        setMessage(null);
        setSession(undo);
      }}
    />
  );
};

type GameScreenProps = {
  session: Session;
  state: GameState;
  viewer: Seat;
  message: string | null;
  preview: MoveCardId | null;
  previewRef: { current: MoveCardId | null };
  setPreview: (card: MoveCardId | null) => void;
  act: (option: OptionId) => void;
  showExplain: (target: Target) => void;
  onUndo: () => void;
};

const GameScreen = (p: GameScreenProps) => {
  const { state, viewer } = p;
  const pending = state.pending!;
  const options = getOptions(state);
  // 合法手を所作の対応表（gestures.ts）で領域ごとに振り分ける。
  const byArea = new Map<Area, Map<OptionId, Target>>();
  for (const o of options) {
    const t = targetOf(state, o);
    const area = areaOf(t);
    if (!byArea.has(area)) byArea.set(area, new Map());
    byArea.get(area)!.set(o, t);
  }
  const area = (a: Area) => byArea.get(a) ?? new Map<OptionId, Target>();

  const previewInfo: BoardPreview | null =
    p.preview !== null && pending.kind === 'playCard' && options.includes(`play:${p.preview}`)
      ? previewHumanMove(state, viewer, p.preview)
      : null;

  // 安全網（design.md §8）：画面上に対象の見つからない合法手を「その他の操作」に出し、件数を数える。
  const rootRef = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState<OptionId[]>([]);
  const counted = useRef<string>('');
  const key = stateKey(p.session);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const shown = new Set<string>();
    for (const el of root.querySelectorAll('[data-option]')) {
      if (el.closest('[data-fallback]') !== null) continue;
      shown.add(el.getAttribute('data-option') ?? '');
      for (const o of (el.getAttribute('data-also') ?? '').split(' ')) if (o !== '') shown.add(o);
    }
    const lost = options.filter((o) => !shown.has(o));
    if (lost.join(',') !== missing.join(',')) setMissing(lost);
    if (lost.length > 0 && counted.current !== key) {
      counted.current = key;
      window.__fallbackCount = (window.__fallbackCount ?? 0) + lost.length;
    }
  });

  const handleCard = (card: MoveCardId) => {
    const option: OptionId = `play:${card}`;
    if (!options.includes(option)) {
      p.showExplain({ type: 'handCard', card });
      return;
    }
    // 人間移動カードは 1 回目のタップで移動先を予告し、2 回目で確定する（U-02）。
    if (MOVE_CARD_BY_ID[card]?.type === 'human' && p.previewRef.current !== card) {
      p.setPreview(card);
      return;
    }
    p.act(option);
  };

  const pendingCard = pending.kind === 'ghostTarget' || pending.kind === 'barrierTarget' ? pending.card : null;
  const events = maskEvents(allEvents(p.session), viewer)
    .map(eventText)
    .filter((t): t is string => t !== null)
    .slice(-LOG_LINES);

  return (
    <div className="game" ref={rootRef}>
      <section className="play-area">
        <header className="status" data-testid="status">
          <span className="turn-badge" style={{ background: seatColor(viewer) }}>
            {seatName(viewer)}
          </span>
          <span className="prompt" data-testid="prompt">
            {PROMPTS[pending.kind]}
            {pendingCard !== null && <>（{cardFullName(pendingCard)}）</>}
          </span>
        </header>
        <Board
          state={state}
          options={area('board')}
          barrierMode={pending.kind === 'barrierTarget'}
          preview={previewInfo}
          onChoose={p.act}
          onExplain={p.showExplain}
        />
        <p className="legend">白いシーツ＝お化け（1 点）、金のシーツ＝ゴールデン（3 点）、丸の数字は匹数。頭巾＝怨霊。駒の燭台の灯が向き。S＝スタート地点。</p>
        {p.message !== null && (
          <p className="message" role="status" data-testid="explain-message">
            {p.message}
          </p>
        )}
        <Controls options={area('controls')} act={p.act} canUndo={canUndo(p.session)} onUndo={p.onUndo} />
        <section className="hand" aria-label="手札" data-testid="hand">
          {state.players[viewer]!.hand.map((card) => {
            const option: OptionId = `play:${card}`;
            const legal = area('hand').has(option);
            const human = MOVE_CARD_BY_ID[card]?.type === 'human';
            return (
              <button
                key={card}
                type="button"
                className={`card ${legal ? 'selectable' : 'disabled'} ${p.preview === card ? 'previewing' : ''} kind-${MOVE_CARD_BY_ID[card]?.type ?? ''}`}
                data-testid="hand-card"
                {...(legal ? { 'data-option': option } : {})}
                aria-disabled={!legal}
                aria-label={cardFullName(card)}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse' && legal && human) p.setPreview(card);
                }}
                onClick={() => handleCard(card)}
              >
                <CardFace card={card} />
              </button>
            );
          })}
        </section>
        {previewInfo !== null && (
          <p className="preview-text" data-testid="preview">
            {previewInfo.blocked
              ? `${previewInfo.to} で向きだけ変わります（進めません）。もう一度タップで決定`
              : previewInfo.contact
                ? `${previewInfo.to} へ進み、怨霊に触れます。もう一度タップで決定`
                : `${previewInfo.to} へ進みます。もう一度タップで決定`}
          </p>
        )}
        {missing.length > 0 && (
          <section className="fallback" data-fallback aria-label="その他の操作">
            <h2>その他の操作</h2>
            {missing.map((o) => (
              <button key={o} type="button" className="fallback-button" data-testid="fallback-option" data-option={o} onClick={() => p.act(o)}>
                {GESTURES[targetOf(state, o).type].description}：{o}
              </button>
            ))}
          </section>
        )}
      </section>
      <aside className="side">
        <InfoPanel state={state} viewer={viewer} options={area('info')} act={p.act} showExplain={p.showExplain} />
        <section className="log" aria-label="出来事" data-testid="log">
          <h2>出来事</h2>
          <ol>
            {events.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
};

const Controls = (p: { options: ReadonlyMap<OptionId, Target>; act: (o: OptionId) => void; canUndo: boolean; onUndo: () => void }) => {
  const buttons: ReactNode[] = [];
  for (const [option, target] of p.options) {
    if (target.type !== 'button') continue;
    const label = target.action === 'overlapContinue' ? 'そのまま続ける' : '怨霊の部屋のお化けを除いて置き直す';
    buttons.push(
      <button key={option} type="button" className="action" data-testid={`button-${target.action}`} data-option={option} onClick={() => p.act(option)}>
        {label}
      </button>,
    );
  }
  if (buttons.length === 0 && !p.canUndo) return null;
  return (
    <div className="controls">
      {buttons}
      {p.canUndo && (
        <button type="button" className="undo" data-testid="undo" onClick={p.onUndo}>
          選び直す
        </button>
      )}
    </div>
  );
};

const InfoPanel = (p: {
  state: GameState;
  viewer: Seat;
  options: ReadonlyMap<OptionId, Target>;
  act: (o: OptionId) => void;
  showExplain: (t: Target) => void;
}) => {
  const counts = deckCounts(p.state);
  return (
    <section className="info" aria-label="情報" data-testid="info">
      <ul className="seats">
        {p.state.players.map((pl) => {
          const mine = pl.seat === p.viewer;
          return (
            <li key={pl.seat} className={pl.seat === p.state.turn ? 'seat current' : 'seat'} data-testid={`seat-${pl.seat + 1}`}>
              <span className="seat-name">
                <span className="dot" style={{ background: seatColor(pl.seat) }} />
                {seatName(pl.seat)}
                {pl.seat === p.state.turn && <span className="turn-mark">手番</span>}
              </span>
              <span className="score">{scoreOf(p.state, pl.seat)} 点</span>
              <span className="held">
                {(['normal', 'golden'] as const).map((kind) => {
                  const text = `${kind === 'golden' ? 'ゴールデン' : 'お化け'}×${pl.held[kind]}`;
                  if (!mine) return <span key={kind} className={`held-chip ${kind}`}>{text}</span>;
                  const option: OptionId = `lose:${kind}`;
                  const legal = p.options.has(option);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`held-chip ${kind} ${legal ? 'selectable' : ''}`}
                      data-testid={`held-${kind}`}
                      {...(legal ? { 'data-option': option } : {})}
                      onClick={() => (legal ? p.act(option) : p.showExplain({ type: 'heldChip', kind }))}
                    >
                      {text}
                    </button>
                  );
                })}
              </span>
              {!mine && <span className="hand-count">手札 {pl.hand.length} 枚</span>}
            </li>
          );
        })}
      </ul>
      <p className="decks" data-testid="decks">
        移動カード：山札 {counts.move} 枚・捨て札 {counts.moveDiscard} 枚／お化けカード：残り {counts.ghost} 枚
      </p>
    </section>
  );
};

const Result = ({ state }: { state: GameState }) => {
  const r = state.result!;
  const head =
    r.winners.length === 1
      ? `${seatName(r.winners[0]!)} の勝ち`
      : `${r.winners.map(seatName).join('・')} の引き分け`;
  const reason = r.reason === 'score' ? '10 点に到達しました' : 'お化けカードの山札が尽きました';
  return (
    <main className="result" data-testid="game-result">
      <svg className="result-art" viewBox="0 0 100 100" aria-hidden="true">
        <use href={r.reason === 'score' ? '#art-chip-golden' : '#art-chip-normal'} x={0} y={0} width={100} height={100} className="float" />
      </svg>
      <h1>{head}</h1>
      <p>{reason}</p>
      <ol className="scores">
        {r.scores.map((score, seat) => (
          <li key={seat}>
            <span className="dot" style={{ background: seatColor(seat) }} />
            {seatName(seat)}：{score} 点{r.winners.includes(seat as Seat) && '（勝ち）'}
          </li>
        ))}
      </ol>
      <a className="action" href="#/" data-testid="back-to-top">
        トップへ戻る
      </a>
    </main>
  );
};
