// 履歴（design.md §4.2）。オンライン同期ではチェックポイントと選択肢 ID の列で局面を表す。
import { applyMove } from './engine.ts';
import type { GameState, OptionId } from './types.ts';

/** チェックポイントから選択肢 ID を順に適用する。 */
export const replay = (checkpoint: GameState, moves: readonly OptionId[]): GameState =>
  moves.reduce((state, option) => applyMove(state, option), checkpoint);

/**
 * prev から next への適用がチェックポイントになるかを判定する。次のいずれかで真とする。
 * 乱数を消費した、移動カードを引いた、怨霊との接触が発生した、選択待ちのプレイヤーが変わった、
 * 手番番号が変わった、ゲームが終了した。
 */
export const isCheckpoint = (prev: GameState, next: GameState): boolean =>
  prev.rng !== next.rng ||
  next.events.some((e) => e.type === 'cardDrawn' || e.type === 'contact') ||
  prev.pending?.player !== next.pending?.player ||
  prev.turnNo !== next.turnNo ||
  (prev.result === null && next.result !== null);

/** moves が空でなければ末尾を 1 つ除いた列を返す。空なら null（取り消せない）を返す。 */
export const undoLast = (_checkpoint: GameState, moves: readonly OptionId[]): OptionId[] | null =>
  moves.length === 0 ? null : moves.slice(0, -1);
