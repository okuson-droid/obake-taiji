// rules v0.1 §2.1・§2.2（部屋と辺）、§2.5・§2.6（スタート地点と開始時の向き）、§2.8（怨霊の初期位置）
import { describe, expect, test } from 'vitest';
import {
  CELLS,
  EDGES,
  EDGE_IDS,
  START_ASSIGNMENT,
  START_CELLS,
  START_FACING,
  WRAITH_START,
} from '../src/data/board.ts';
import { cellIndex, edgeBetween } from '../src/game/board-ops.ts';

describe('部屋（rules v0.1 §2.1）', () => {
  test('§2.1 部屋は A1〜F6 の 36 部屋で重複しない', () => {
    expect(CELLS).toHaveLength(36);
    expect(new Set(CELLS).size).toBe(36);
    for (const col of 'ABCDEF') {
      for (let row = 1; row <= 6; row++) {
        expect(CELLS).toContain(`${col}${row}`);
      }
    }
  });
});

describe('辺（rules v0.1 §2.2）', () => {
  test('§2.2 辺は 60 本で ID が重複しない', () => {
    expect(EDGES).toHaveLength(60);
    expect(new Set(EDGE_IDS).size).toBe(60);
  });

  test('§2.2 東西方向（E 辺）30 本・南北方向（S 辺）30 本', () => {
    expect(EDGE_IDS.filter((id) => id.startsWith('E:'))).toHaveLength(30);
    expect(EDGE_IDS.filter((id) => id.startsWith('S:'))).toHaveLength(30);
  });

  test('design §3.1 E 辺は列 A〜E・行 1〜6、S 辺は列 A〜F・行 1〜5 に置かれる', () => {
    for (const id of EDGE_IDS) {
      const cell = id.slice(2);
      if (id.startsWith('E:')) {
        expect('ABCDE').toContain(cell[0]);
        expect('123456').toContain(cell.slice(1));
      } else {
        expect('ABCDEF').toContain(cell[0]);
        expect('12345').toContain(cell.slice(1));
      }
    }
  });

  test('§2.2 各辺は隣接する 2 部屋に対応し、edgeBetween と一致する', () => {
    for (const edge of EDGES) {
      const [a, b] = edge.cells;
      const pa = cellIndex(a);
      const pb = cellIndex(b);
      expect(Math.abs(pa.col - pb.col) + Math.abs(pa.row - pb.row)).toBe(1);
      expect(edgeBetween(a, b)).toBe(edge.id);
      expect(edgeBetween(b, a)).toBe(edge.id);
    }
  });

  test('§2.2 隣接する部屋の組はちょうど 60 組で、すべて辺を持つ', () => {
    let pairs = 0;
    for (const a of CELLS) {
      for (const b of CELLS) {
        if (a >= b) continue;
        const id = edgeBetween(a, b);
        if (id !== null) {
          pairs++;
          expect(EDGE_IDS).toContain(id);
        }
      }
    }
    expect(pairs).toBe(60);
  });

  test('design §3.1 "E:B3" は B3 と C3 の間、"S:B3" は B3 と B4 の間の辺である', () => {
    expect(EDGES.find((e) => e.id === 'E:B3')?.cells).toEqual(['B3', 'C3']);
    expect(EDGES.find((e) => e.id === 'S:B3')?.cells).toEqual(['B3', 'B4']);
  });

  test('design §6.1 辺 ID は昇順に並ぶ', () => {
    expect([...EDGE_IDS]).toEqual([...EDGE_IDS].sort());
  });
});

describe('スタート地点（rules v0.1 §2.5・§2.6）', () => {
  test('§2.5 スタート地点は四隅の A1・F1・F6・A6', () => {
    expect([...START_CELLS].sort()).toEqual(['A1', 'A6', 'F1', 'F6']);
  });

  test('§2.5 開始時の向き：A1 が東、F1 が南、F6 が西、A6 が北', () => {
    expect(START_FACING).toEqual({ A1: 'E', F1: 'S', F6: 'W', A6: 'N' });
  });

  test('§2.6 2 人：席 1＝A1、席 2＝F6', () => {
    expect(START_ASSIGNMENT[2]).toEqual(['A1', 'F6']);
  });

  test('§2.6 3 人：席 1＝A1、席 2＝F1、席 3＝F6', () => {
    expect(START_ASSIGNMENT[3]).toEqual(['A1', 'F1', 'F6']);
  });

  test('§2.6 4 人：席 1＝A1、席 2＝F1、席 3＝F6、席 4＝A6', () => {
    expect(START_ASSIGNMENT[4]).toEqual(['A1', 'F1', 'F6', 'A6']);
  });
});

describe('怨霊コマ（rules v0.1 §2.8）', () => {
  test('§2.8 怨霊コマの初期位置は C3', () => {
    expect(WRAITH_START).toBe('C3');
  });
});
