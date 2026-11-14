// 盤面の計算（rules v0.1 §2.1・§2.2・§5.1・§5.5、design.md §3.1・§5.11）。
import { COLS, CELLS, EDGES, ROWS } from '../data/board.ts';
import type { Cell, Col, Dir, EdgeId, HumanCardKind, Row } from './types.ts';

/** 時計回りの順（N→E→S→W→N） */
const CLOCKWISE: readonly Dir[] = ['N', 'E', 'S', 'W'];

/** 方角を時計回りに steps 回（90 度ずつ）回す。負の値は反時計回りである。 */
export const rotate = (dir: Dir, steps: number): Dir => {
  const i = CLOCKWISE.indexOf(dir);
  return CLOCKWISE[(((i + steps) % 4) + 4) % 4] as Dir;
};

/** 時計回りに 90 度（「右」） */
export const turnRight = (dir: Dir): Dir => rotate(dir, 1);
/** 反時計回りに 90 度（「左」） */
export const turnLeft = (dir: Dir): Dir => rotate(dir, -1);
/** 反対の方角（「後ろ」） */
export const reverse = (dir: Dir): Dir => rotate(dir, 2);

/**
 * 人間移動カードの移動方角を決める（rules v0.1 §5.1 の手順 1）。
 * 「東」「西」「南」「北」はその方角、「前」「後ろ」「右」「左」は現在の向きからの相対である。
 */
export const humanMoveDir = (facing: Dir, kind: HumanCardKind): Dir => {
  switch (kind) {
    case 'front':
      return facing;
    case 'back':
      return reverse(facing);
    case 'right':
      return turnRight(facing);
    case 'left':
      return turnLeft(facing);
    default:
      return kind;
  }
};

/** 部屋の列番号（A＝0〜F＝5）と行番号（1 行目＝0〜6 行目＝5） */
export const cellIndex = (cell: Cell): { col: number; row: number } => ({
  col: COLS.indexOf(cell[0] as Col),
  row: ROWS.indexOf(Number(cell.slice(1)) as Row),
});

const cellAt = (col: number, row: number): Cell | null => {
  const c = COLS[col];
  const r = ROWS[row];
  return c === undefined || r === undefined ? null : `${c}${r}`;
};

/** 方角ごとの列・行の増分。北は行番号が減る方向、東は列が進む方向である（design.md §3.1）。 */
const DELTA: Readonly<Record<Dir, { dc: number; dr: number }>> = {
  N: { dc: 0, dr: -1 },
  E: { dc: 1, dr: 0 },
  S: { dc: 0, dr: 1 },
  W: { dc: -1, dr: 0 },
};

/** dir の方角の隣の部屋を返す。外周の壁であれば null を返す（rules v0.1 §2.2）。 */
export const neighbor = (cell: Cell, dir: Dir): Cell | null => {
  const { col, row } = cellIndex(cell);
  const d = DELTA[dir];
  return cellAt(col + d.dc, row + d.dr);
};

/** 隣接する 2 部屋の間の辺 ID を返す。隣接していなければ null を返す（design.md §3.1）。 */
export const edgeBetween = (a: Cell, b: Cell): EdgeId | null => {
  const pa = cellIndex(a);
  const pb = cellIndex(b);
  if (pa.row === pb.row && Math.abs(pa.col - pb.col) === 1) {
    const west = pa.col < pb.col ? a : b;
    return `E:${west}`;
  }
  if (pa.col === pb.col && Math.abs(pa.row - pb.row) === 1) {
    const north = pa.row < pb.row ? a : b;
    return `S:${north}`;
  }
  return null;
};

/** cell から dir の方角にある辺 ID を返す。外周の壁であれば null を返す。 */
export const edgeInDir = (cell: Cell, dir: Dir): EdgeId | null => {
  const to = neighbor(cell, dir);
  return to === null ? null : edgeBetween(cell, to);
};

/** 辺に通せん棒があるかを判定する。 */
export const hasBarrier = (barriers: readonly EdgeId[], edge: EdgeId): boolean => barriers.includes(edge);

/** 部屋ごとに、通せん棒のない辺でつながる隣の部屋を求める。 */
const openAdjacency = (barriers: readonly EdgeId[]): Map<Cell, Cell[]> => {
  const blocked = new Set(barriers);
  const adj = new Map<Cell, Cell[]>(CELLS.map((c) => [c, []]));
  for (const edge of EDGES) {
    if (blocked.has(edge.id)) continue;
    const [a, b] = edge.cells;
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  return adj;
};

/**
 * 連結判定（rules v0.1 §5.5、design.md §5.11）。
 * 通せん棒のない辺だけをたどる幅優先探索を A1 から行い、36 部屋すべてに届けば true を返す。
 */
export const isConnected = (barriers: readonly EdgeId[]): boolean => {
  const adj = openAdjacency(barriers);
  const start: Cell = 'A1';
  const seen = new Set<Cell>([start]);
  const queue: Cell[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] as Cell;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return seen.size === CELLS.length;
};
