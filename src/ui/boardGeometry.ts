// 盤面の座標（viewBox の単位）。盤面の描画（Board.tsx）と演出の計画（animation.ts）で共有する。
import { COLS, ROWS } from '../data/board.ts';
import type { Cell, ChipKind, GameState, Seat } from '../game/types.ts';

/** 見出しの幅と部屋の大きさ。375px 幅で 1 単位がおよそ 0.92px になる。 */
export const HEAD = 20;
export const SIZE = 60;
export const VIEW = HEAD + SIZE * 6;

export type Point = { x: number; y: number };

/** 部屋の左上の座標 */
export const cellPos = (cell: Cell): Point => ({
  x: HEAD + COLS.indexOf(cell[0] as (typeof COLS)[number]) * SIZE,
  y: HEAD + ROWS.indexOf(Number(cell.slice(1)) as (typeof ROWS)[number]) * SIZE,
});

/**
 * 部屋の中の置き場所（部屋は 60×60）。左に人間駒か怨霊（同じ部屋にはいない）、右の列にお化けを置き、
 * タップできるお化けと怨霊の当たり判定が重ならないようにする。
 * 駒は 1 人なら左の中ほど、複数なら四隅に置く（design.md §8）。
 */
export const LEFT_SLOT: [number, number] = [22, 30];
export const CHIP_SLOT: Readonly<Record<ChipKind, [number, number]>> = { golden: [45, 17], normal: [45, 43] };
export const CORNERS: readonly [number, number][] = [
  [14, 14],
  [46, 14],
  [46, 46],
  [14, 46],
];

/** 部屋の中の置き場所の座標 */
export const slotPos = (cell: Cell, slot: readonly [number, number]): Point => {
  const { x, y } = cellPos(cell);
  return { x: x + slot[0], y: y + slot[1] };
};

/** 局面の中で人間駒を描く中心の座標と大きさ */
export const piecePlacement = (state: GameState, seat: Seat): Point & { size: number } => {
  const pl = state.players[seat];
  if (pl === undefined) return { x: 0, y: 0, size: 0 };
  const together = state.players.filter((q) => q.pos === pl.pos).length;
  const slot = together > 1 ? (CORNERS[seat] ?? LEFT_SLOT) : LEFT_SLOT;
  return { ...slotPos(pl.pos, slot), size: together > 1 ? 28 : 44 };
};
