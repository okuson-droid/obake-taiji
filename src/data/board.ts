// 盤面の静的データ（rules v0.2 §2.1・§2.2・§2.5・§2.6、design.md §3.1）。
import type { Cell, Col, Dir, EdgeId, GameConfig, Row } from '../game/types.ts';

/** 列。西から東の順（rules v0.2 §2.1） */
export const COLS: readonly Col[] = ['A', 'B', 'C', 'D', 'E', 'F'];
/** 行。北から南の順（rules v0.2 §2.1） */
export const ROWS: readonly Row[] = [1, 2, 3, 4, 5, 6];

/** 36 部屋。北の行から順に、各行を西から東へ並べる。 */
export const CELLS: readonly Cell[] = ROWS.flatMap((row) => COLS.map((col): Cell => `${col}${row}`));

export type Edge = {
  id: EdgeId;
  /** 辺をはさむ 2 部屋。E 辺は [西, 東]、S 辺は [北, 南] の順とする。 */
  cells: readonly [Cell, Cell];
};

const buildEdges = (): Edge[] => {
  const edges: Edge[] = [];
  COLS.forEach((col, ci) => {
    ROWS.forEach((row, ri) => {
      const east = COLS[ci + 1];
      if (east !== undefined) {
        edges.push({ id: `E:${col}${row}`, cells: [`${col}${row}`, `${east}${row}`] });
      }
      const south = ROWS[ri + 1];
      if (south !== undefined) {
        edges.push({ id: `S:${col}${row}`, cells: [`${col}${row}`, `${col}${south}`] });
      }
    });
  });
  return edges.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
};

/**
 * 盤内の辺 60 本（rules v0.2 §2.2）。ID の昇順（文字列の符号単位順）に並べる。
 * 外周は壁であり、辺に含めない。
 */
export const EDGES: readonly Edge[] = buildEdges();

/** 辺 ID の昇順の一覧 */
export const EDGE_IDS: readonly EdgeId[] = EDGES.map((e) => e.id);

/** スタート地点となる四隅の部屋（rules v0.2 §2.5） */
export const START_CELLS: readonly Cell[] = ['A1', 'F1', 'F6', 'A6'];

/** スタート地点ごとの開始時の向き（rules v0.2 §2.5） */
export const START_FACING: Readonly<Record<'A1' | 'F1' | 'F6' | 'A6', Dir>> = {
  A1: 'E',
  F1: 'S',
  F6: 'W',
  A6: 'N',
};

/** 人数別のスタート地点の割り当て。添字は席（0 始まり）である（rules v0.2 §2.6）。 */
export const START_ASSIGNMENT: Readonly<Record<GameConfig['players'], readonly ('A1' | 'F1' | 'F6' | 'A6')[]>> = {
  2: ['A1', 'F6'],
  3: ['A1', 'F1', 'F6'],
  4: ['A1', 'F1', 'F6', 'A6'],
};

/** 怨霊コマの初期位置（rules v0.2 §2.8・§3.3） */
export const WRAITH_START: Cell = 'C3';
