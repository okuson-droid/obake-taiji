// ローカル対戦の状態（design.md §4.2・§7.3 と同じ考え方）。
// 局面は「チェックポイント＋その後の選択肢 ID の列」で持ち、replay で求める。
// 判定は src/game の関数だけで行い、ここではルールを計算しない。
import { applyMove, createGame } from '../game/engine.ts';
import { isCheckpoint, replay, undoLast } from '../game/history.ts';
import type { GameConfig, GameEvent, GameState, OptionId } from '../game/types.ts';

/** 保持する出来事の上限。表示するのは末尾の一部だけである。 */
const LOG_LIMIT = 300;

export type Session = {
  checkpoint: GameState;
  moves: OptionId[];
  /** チェックポイントまでに起きた出来事（古い順） */
  log: GameEvent[];
};

const trim = (events: GameEvent[]): GameEvent[] => events.slice(-LOG_LIMIT);

export const startSession = (config: GameConfig, seed: number): Session => {
  const checkpoint = createGame(config, seed);
  return { checkpoint, moves: [], log: trim([...checkpoint.events]) };
};

/** 現在の局面 */
export const currentState = (s: Session): GameState => replay(s.checkpoint, s.moves);

/** チェックポイント以降の選択肢で起きた出来事（取り消せる範囲） */
export const pendingEvents = (s: Session): GameEvent[] => {
  const events: GameEvent[] = [];
  let state = s.checkpoint;
  for (const m of s.moves) {
    state = applyMove(state, m);
    events.push(...state.events);
  }
  return events;
};

/** 選択肢を 1 つ適用する。チェックポイントになれば進め、ならなければ選択肢の列に足す。 */
export const choose = (s: Session, option: OptionId): Session => {
  const state = currentState(s);
  const next = applyMove(state, option);
  if (isCheckpoint(state, next)) {
    return { checkpoint: next, moves: [], log: trim([...s.log, ...pendingEvents(s), ...next.events]) };
  }
  return { ...s, moves: [...s.moves, option] };
};

/** 「選び直す」で取り消せるか */
export const canUndo = (s: Session): boolean => undoLast(s.checkpoint, s.moves) !== null;

/** 直前の選択を取り消す（U-03）。取り消せなければそのまま返す。 */
export const undo = (s: Session): Session => {
  const moves = undoLast(s.checkpoint, s.moves);
  return moves === null ? s : { ...s, moves };
};

/** これまでの出来事すべて（チェックポイント以降の分を含む） */
export const allEvents = (s: Session): GameEvent[] => [...s.log, ...pendingEvents(s)];
