// rules v0.2 §5.1（人間移動カードの方角）、§2.2（隣接と外周の壁）、§5.5（連結条件）
import { describe, expect, test } from 'vitest';
import { CELLS, EDGE_IDS } from '../src/data/board.ts';
import {
  edgeBetween,
  edgeInDir,
  hasBarrier,
  humanMoveDir,
  isConnected,
  neighbor,
  reverse,
  rotate,
  turnLeft,
  turnRight,
} from '../src/game/board-ops.ts';
import type { Dir, EdgeId, HumanCardKind } from '../src/game/types.ts';

describe('方角の回転（rules v0.2 §5.1、design §3.1）', () => {
  test('§5.1 右は時計回りに 90 度（N→E→S→W→N）', () => {
    expect(['N', 'E', 'S', 'W'].map((d) => turnRight(d as Dir))).toEqual(['E', 'S', 'W', 'N']);
  });

  test('§5.1 左は反時計回りに 90 度', () => {
    expect(['N', 'E', 'S', 'W'].map((d) => turnLeft(d as Dir))).toEqual(['W', 'N', 'E', 'S']);
  });

  test('§5.1 後ろは反対の方角', () => {
    expect(['N', 'E', 'S', 'W'].map((d) => reverse(d as Dir))).toEqual(['S', 'W', 'N', 'E']);
  });

  test('4 回まわすと元に戻る', () => {
    for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
      expect(rotate(d, 4)).toBe(d);
      expect(rotate(d, -4)).toBe(d);
      expect(rotate(d, -1)).toBe(turnLeft(d));
    }
  });
});

describe('人間移動カードの移動方角（rules v0.2 §5.1 手順 1）', () => {
  // [カードの種類, 向き N のとき, 向き E のとき, 向き S のとき, 向き W のとき]
  const table: [HumanCardKind, Dir, Dir, Dir, Dir][] = [
    ['front', 'N', 'E', 'S', 'W'],
    ['back', 'S', 'W', 'N', 'E'],
    ['right', 'E', 'S', 'W', 'N'],
    ['left', 'W', 'N', 'E', 'S'],
    ['N', 'N', 'N', 'N', 'N'],
    ['E', 'E', 'E', 'E', 'E'],
    ['S', 'S', 'S', 'S', 'S'],
    ['W', 'W', 'W', 'W', 'W'],
  ];
  const facings: Dir[] = ['N', 'E', 'S', 'W'];

  for (const [kind, ...expected] of table) {
    facings.forEach((facing, i) => {
      test(`§5.1 「${kind}」を向き ${facing} から使うと ${expected[i]} へ進む`, () => {
        expect(humanMoveDir(facing, kind)).toBe(expected[i]);
      });
    });
  }
});

describe('隣の部屋（rules v0.2 §2.1・§2.2）', () => {
  test('§2.1 北は行番号が減り、東は列が進む', () => {
    expect(neighbor('C3', 'N')).toBe('C2');
    expect(neighbor('C3', 'S')).toBe('C4');
    expect(neighbor('C3', 'E')).toBe('D3');
    expect(neighbor('C3', 'W')).toBe('B3');
  });

  test('§2.2 外周の壁の方向は null になる', () => {
    expect(neighbor('A1', 'N')).toBeNull();
    expect(neighbor('A1', 'W')).toBeNull();
    expect(neighbor('F1', 'N')).toBeNull();
    expect(neighbor('F1', 'E')).toBeNull();
    expect(neighbor('F6', 'S')).toBeNull();
    expect(neighbor('F6', 'E')).toBeNull();
    expect(neighbor('A6', 'S')).toBeNull();
    expect(neighbor('A6', 'W')).toBeNull();
    expect(neighbor('C1', 'N')).toBeNull();
    expect(neighbor('F4', 'E')).toBeNull();
    expect(neighbor('B6', 'S')).toBeNull();
    expect(neighbor('A5', 'W')).toBeNull();
  });

  test('§2.2 外周の壁は各辺 6 か所、計 24 か所で、それ以外の方向はすべて盤内の部屋である', () => {
    let walls = 0;
    for (const cell of CELLS) {
      for (const dir of ['N', 'E', 'S', 'W'] as Dir[]) {
        const nb = neighbor(cell, dir);
        if (nb === null) {
          walls++;
          expect(edgeInDir(cell, dir)).toBeNull();
        } else {
          expect(CELLS).toContain(nb);
          expect(neighbor(nb, reverse(dir))).toBe(cell);
          expect(edgeInDir(cell, dir)).toBe(edgeBetween(cell, nb));
        }
      }
    }
    expect(walls).toBe(24);
  });

  test('§2.2 隣接しない 2 部屋の間に辺はない', () => {
    expect(edgeBetween('A1', 'B2')).toBeNull();
    expect(edgeBetween('A1', 'C1')).toBeNull();
    expect(edgeBetween('A1', 'A1')).toBeNull();
    expect(edgeBetween('F1', 'A2')).toBeNull();
  });
});

describe('通せん棒の有無（rules v0.2 §2.3）', () => {
  test('§2.3 置かれた辺だけが通せん棒ありと判定される', () => {
    const barriers: EdgeId[] = ['E:B3', 'S:C4'];
    expect(hasBarrier(barriers, 'E:B3')).toBe(true);
    expect(hasBarrier(barriers, 'S:C4')).toBe(true);
    expect(hasBarrier(barriers, 'S:B3')).toBe(false);
    expect(hasBarrier([], 'E:B3')).toBe(false);
  });
});

describe('連結判定（rules v0.2 §5.5、design §5.11）', () => {
  test('§5.5 通せん棒なしで連結している', () => {
    expect(isConnected([])).toBe(true);
  });

  test('§5.5 角の部屋を囲む 2 本で非連結になる', () => {
    expect(isConnected(['E:A1', 'S:A1'])).toBe(false); // A1
    expect(isConnected(['E:E1', 'S:F1'])).toBe(false); // F1
    expect(isConnected(['E:E6', 'S:F5'])).toBe(false); // F6
    expect(isConnected(['E:A6', 'S:A5'])).toBe(false); // A6
  });

  test('§5.5 角の部屋の辺 1 本だけでは連結している', () => {
    expect(isConnected(['E:A1'])).toBe(true);
    expect(isConnected(['S:A1'])).toBe(true);
    expect(isConnected(['E:E6'])).toBe(true);
  });

  test('§5.5 どの 1 本を置いても連結している', () => {
    for (const id of EDGE_IDS) {
      expect(isConnected([id])).toBe(true);
    }
  });

  test('§5.5 盤を東西に分断する 1 列分の通せん棒で非連結、1 本欠けると連結', () => {
    const wall: EdgeId[] = ['E:C1', 'E:C2', 'E:C3', 'E:C4', 'E:C5', 'E:C6'];
    expect(isConnected(wall)).toBe(false);
    expect(isConnected(wall.slice(1))).toBe(true);
  });

  test('§5.5 中央の部屋を囲む 4 本で非連結、3 本では連結', () => {
    const around: EdgeId[] = ['S:C2', 'E:C3', 'S:C3', 'E:B3']; // C3 の北・東・南・西
    expect(isConnected(around)).toBe(false);
    expect(isConnected(around.slice(0, 3))).toBe(true);
  });

  test('§5.5 全 60 本で非連結になる', () => {
    expect(isConnected(EDGE_IDS)).toBe(false);
  });
});
