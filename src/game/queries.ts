// UI 向けの派生値（design.md §4.5）。UI は移動先や得点をみずから再計算せず、これらを呼ぶ。
import { EDGE_IDS } from '../data/board.ts';
import { MOVE_CARD_BY_ID } from '../data/cards.ts';
import { edgeInDir, hasBarrier, humanMoveDir, isConnected, neighbor } from './board-ops.ts';
import type { Cell, Chip, Dir, EdgeId, GameState, MoveCardId, PlayerState, Seat } from './types.ts';

/** 獲得済みチップの点数。通常 1 点、ゴールデン 3 点（rules v0.2 §6.4） */
export const pointsOf = (held: PlayerState['held']): number => held.normal + held.golden * 3;

/** 席を指定してプレイヤーを取り出す。存在しない席であれば例外を投げる。 */
export const playerAt = (state: GameState, seat: Seat): PlayerState => {
  const p = state.players[seat];
  if (p === undefined) throw new Error(`席 ${seat + 1} は存在しない`);
  return p;
};

/** 席の獲得点の合計（rules v0.2 §6.4） */
export const scoreOf = (state: GameState, seat: Seat): number => pointsOf(playerAt(state, seat).held);

/** 部屋にあるお化けチップ。配置順に並ぶ。 */
export const chipsAt = (state: GameState, cell: Cell): Chip[] => state.chips.filter((c) => c.cell === cell);

/** 怨霊コマのいる部屋かを判定する。 */
export const isWraithRoom = (state: GameState, cell: Cell): boolean => state.wraith === cell;

/**
 * 人間移動カードを使った結果を予測する（rules v0.2 §5.1・§5.3、U-02 のプレビュー用）。
 * blocked は外周の壁または通せん棒で移動しなかったこと、contact は怨霊の部屋に入ることを表す。
 * contact が真の場合も、to は接触前に入る部屋（怨霊の部屋）を表す。
 */
export const previewHumanMove = (
  state: GameState,
  seat: Seat,
  card: MoveCardId,
): { to: Cell; facing: Dir; blocked: boolean; contact: boolean } => {
  const def = MOVE_CARD_BY_ID[card];
  if (def === undefined || def.type !== 'human') throw new Error(`${card} は人間移動カードではない`);
  const p = playerAt(state, seat);
  const facing = humanMoveDir(p.facing, def.kind);
  const next = neighbor(p.pos, facing);
  const edge = edgeInDir(p.pos, facing);
  // 外周の壁、または移動方向の辺に通せん棒がある場合は移動しない（rules v0.2 §5.1 手順 3）。
  const blocked = next === null || edge === null || hasBarrier(state.barriers, edge);
  const to = blocked ? p.pos : next;
  return { to, facing, blocked, contact: !blocked && isWraithRoom(state, to) };
};

/** 山札と捨て札の残り枚数 */
export const deckCounts = (state: GameState): { move: number; moveDiscard: number; ghost: number } => ({
  move: state.moveDeck.length,
  moveDiscard: state.moveDiscard.length,
  ghost: state.ghostDeck.length,
});

/**
 * 通せん棒を設置できるかを判定する（rules v0.2 §2.3・§5.5(a)）。
 * 盤内の辺であり、通せん棒が置かれておらず、設置後も 36 部屋が互いに行き来できる場合に真とする。
 */
export const canPlaceBarrier = (state: GameState, edge: EdgeId): boolean =>
  EDGE_IDS.includes(edge) && !hasBarrier(state.barriers, edge) && isConnected([...state.barriers, edge]);

/** 通せん棒を設置できる辺を、辺 ID の昇順に返す（design.md §6.1）。 */
export const placeableEdges = (state: GameState): EdgeId[] => EDGE_IDS.filter((e) => canPlaceBarrier(state, e));
