// 演出の計画。直前の選択の前後の局面と、その選択で起きた出来事（GameEvent）から、盤面の要素の動きを決める。
// ルールは計算しない。何が起きたかは出来事だけを見て決める。DOM には触れない（Board.tsx が Web Animations で再生する）。
//
// 順番：①人間・お化け・怨霊の移動と通せん棒の設置・撤去 → ②お化けの獲得 → ③新しいお化けの出現。
import type { Cell, ChipId, ChipKind, Dir, EdgeId, GameEvent, GameState, Seat } from '../game/types.ts';
import { CHIP_SLOT, LEFT_SLOT, SIZE, cellPos, piecePlacement, slotPos, type Point } from './boardGeometry.ts';

/** 演出の長さ（ミリ秒） */
export const TIMING = {
  move: 450,
  bump: 320,
  contact: 1100,
  barrier: 450,
  acquire: 850,
  acquireStagger: 250,
  appear: 380,
  appearStagger: 90,
  tail: 150,
} as const;

/** 要素の位置からのずれ・拡大率・不透明度の 1 コマ。offset は 0〜1 の時刻。 */
export type Frame = { dx: number; dy: number; scale: number; opacity: number; offset?: number };

export type AnimTarget =
  | { type: 'piece'; seat: Seat }
  | { type: 'chip'; chip: ChipId }
  | { type: 'wraith' }
  | { type: 'barrier'; edge: EdgeId }
  | { type: 'fx'; id: string };

export type AnimStep = { target: AnimTarget; frames: Frame[]; delay: number; duration: number };

/** 演出のためだけに一時的に描く絵 */
export type Overlay =
  | { id: string; kind: 'sprite'; chipKind: ChipKind; x: number; y: number; size: number }
  | { id: string; kind: 'text'; x: number; y: number; text: string }
  | { id: string; kind: 'ring'; x: number; y: number; r: number }
  | { id: string; kind: 'plank'; edge: EdgeId; x: number; y: number; width: number; height: number };

export type AnimationPlan = { steps: AnimStep[]; overlays: Overlay[]; total: number };

const frame = (dx = 0, dy = 0, scale = 1, opacity = 1, offset?: number): Frame =>
  offset === undefined ? { dx, dy, scale, opacity } : { dx, dy, scale, opacity, offset };

const DIR_UNIT: Readonly<Record<Dir, [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

const shake = (): Frame[] => [frame(), frame(4), frame(-4), frame(3), frame()];

/** 壁や通せん棒に当たって進めなかった駒の、向いた方へ小さく押して戻る動き */
const bump = (facing: Dir): Frame[] => {
  const [ux, uy] = DIR_UNIT[facing];
  return [frame(), frame(ux * 7, uy * 7, 1, 1, 0.4), frame()];
};

/** a から b へのずれ */
const delta = (a: Point, b: Point): [number, number] => [a.x - b.x, a.y - b.y];

/** 怨霊の部屋に入ってから（または怨霊が来てから）スタート地点へ戻る駒の動き */
const returnToStart = (start: Point, inWraithRoom: Point, final: Point): Frame[] => {
  const [sx, sy] = delta(start, final);
  const [wx, wy] = delta(inWraithRoom, final);
  return [frame(sx, sy), frame(wx, wy, 1, 1, 0.4), frame(wx, wy, 1, 1, 0.55), frame(wx, wy, 0.8, 0.15, 0.75), frame(0, 0, 1, 1, 1)];
};

const edgeRect = (edge: EdgeId): { x: number; y: number; width: number; height: number } => {
  const { x, y } = cellPos(edge.slice(2) as Cell);
  return edge.startsWith('E:')
    ? { x: x + SIZE - 4, y: y + 3, width: 8, height: SIZE - 6 }
    : { x: x + 3, y: y + SIZE - 4, width: SIZE - 6, height: 8 };
};

const center = (cell: Cell): Point => {
  const { x, y } = cellPos(cell);
  return { x: x + SIZE / 2, y: y + SIZE / 2 };
};

/**
 * prev から next への 1 回の選択の演出を計画する。演出するものがなければ null を返す。
 * next.events はその選択で起きた出来事である（design.md §4.1）。
 */
export const planAnimation = (prev: GameState, next: GameState): AnimationPlan | null => {
  const events = next.events;
  const steps: AnimStep[] = [];
  const overlays: Overlay[] = [];
  const returned = new Set<Seat>(events.filter((e) => e.type === 'returnedToStart').map((e) => e.seat));
  const kindOf = new Map<ChipId, ChipKind>([...prev.chips, ...next.chips].map((c) => [c.id, c.kind]));
  const inNext = new Set<ChipId>(next.chips.map((c) => c.id));
  let moveEnd = 0;
  const end = (delay: number, duration: number) => {
    moveEnd = Math.max(moveEnd, delay + duration);
  };

  // ① 移動と通せん棒
  for (const e of events) {
    switch (e.type) {
      case 'humanMoved': {
        const final = piecePlacement(next, e.seat);
        if (returned.has(e.seat)) {
          // 怨霊の部屋に入って接触し、スタート地点へ戻る（rules v0.2 §7.2(a)）。
          steps.push({
            target: { type: 'piece', seat: e.seat },
            frames: returnToStart(piecePlacement(prev, e.seat), slotPos(e.to, LEFT_SLOT), final),
            delay: 0,
            duration: TIMING.contact,
          });
          overlays.push({ id: `ring-${e.seat}`, kind: 'ring', ...center(e.to), r: 26 });
          steps.push({ target: { type: 'fx', id: `ring-${e.seat}` }, frames: [frame(0, 0, 0.3, 0), frame(0, 0, 1, 1, 0.4), frame(0, 0, 1.3, 0)], delay: 400, duration: 500 });
          end(0, TIMING.contact);
        } else if (e.blocked) {
          steps.push({ target: { type: 'piece', seat: e.seat }, frames: bump(e.facing), delay: 0, duration: TIMING.bump });
          end(0, TIMING.bump);
        } else {
          const [dx, dy] = delta(piecePlacement(prev, e.seat), final);
          steps.push({ target: { type: 'piece', seat: e.seat }, frames: [frame(dx, dy), frame()], delay: 0, duration: TIMING.move });
          end(0, TIMING.move);
        }
        break;
      }
      case 'ghostMoved': {
        const kind = kindOf.get(e.chip) ?? 'normal';
        if (e.blocked) {
          if (inNext.has(e.chip)) steps.push({ target: { type: 'chip', chip: e.chip }, frames: shake(), delay: 0, duration: TIMING.bump });
          end(0, TIMING.bump);
        } else if (inNext.has(e.chip)) {
          const [dx, dy] = delta(slotPos(e.from, CHIP_SLOT[kind]), slotPos(e.to, CHIP_SLOT[kind]));
          steps.push({ target: { type: 'chip', chip: e.chip }, frames: [frame(dx, dy), frame()], delay: 0, duration: TIMING.move });
          end(0, TIMING.move);
        } else {
          // 動いた先で獲得されて盤から消えたお化けは、一時的な絵で動かす。
          const from = slotPos(e.from, CHIP_SLOT[kind]);
          const [dx, dy] = delta(slotPos(e.to, CHIP_SLOT[kind]), from);
          const id = `move-${e.chip}`;
          overlays.push({ id, kind: 'sprite', chipKind: kind, ...from, size: 24 });
          steps.push({ target: { type: 'fx', id }, frames: [frame(), frame(dx, dy, 1, 1, 0.9), frame(dx, dy, 1, 0)], delay: 0, duration: TIMING.move });
          end(0, TIMING.move);
        }
        break;
      }
      case 'wraithMoved': {
        if (e.blocked) {
          steps.push({ target: { type: 'wraith' }, frames: shake(), delay: 0, duration: TIMING.bump });
          end(0, TIMING.bump);
          break;
        }
        const [dx, dy] = delta(slotPos(e.from, LEFT_SLOT), slotPos(e.to, LEFT_SLOT));
        steps.push({ target: { type: 'wraith' }, frames: [frame(dx, dy), frame()], delay: 0, duration: TIMING.move });
        end(0, TIMING.move);
        // 怨霊が入った部屋にいた駒は接触してスタート地点へ戻る（rules v0.2 §7.2(b)）。
        const hit = prev.players.filter((p) => p.pos === e.to && returned.has(p.seat));
        for (const p of hit) {
          const before = piecePlacement(prev, p.seat);
          steps.push({
            target: { type: 'piece', seat: p.seat },
            frames: returnToStart(before, before, piecePlacement(next, p.seat)),
            delay: 0,
            duration: TIMING.contact,
          });
        }
        if (hit.length > 0) {
          overlays.push({ id: 'ring-wraith', kind: 'ring', ...center(e.to), r: 26 });
          steps.push({ target: { type: 'fx', id: 'ring-wraith' }, frames: [frame(0, 0, 0.3, 0), frame(0, 0, 1, 1, 0.4), frame(0, 0, 1.3, 0)], delay: 400, duration: 500 });
          end(0, TIMING.contact);
        }
        break;
      }
      case 'barrierPlaced':
        steps.push({
          target: { type: 'barrier', edge: e.edge },
          frames: [frame(0, -10, 0.3, 0), frame(0, 0, 1.15, 1, 0.7), frame()],
          delay: 0,
          duration: TIMING.barrier,
        });
        end(0, TIMING.barrier);
        break;
      case 'barrierRemoved': {
        const id = `plank-${e.edge}`;
        overlays.push({ id, kind: 'plank', edge: e.edge, ...edgeRect(e.edge) });
        steps.push({ target: { type: 'fx', id }, frames: [frame(), frame(0, 8, 0.7, 0)], delay: 0, duration: TIMING.barrier });
        end(0, TIMING.barrier);
        break;
      }
      case 'overlapPurged': {
        // 怨霊の部屋のお化けを取り除く（rules v0.2 §7.5(b)）。
        e.chips.forEach((chip, i) => {
          const kind = kindOf.get(chip) ?? 'normal';
          const id = `purge-${chip}`;
          const at = slotPos(prev.wraith, CHIP_SLOT[kind]);
          overlays.push({ id, kind: 'sprite', chipKind: kind, x: at.x + i * 3, y: at.y, size: 24 });
          steps.push({ target: { type: 'fx', id }, frames: [frame(), frame(0, -14, 0.3, 0)], delay: 0, duration: TIMING.move });
        });
        end(0, TIMING.move);
        break;
      }
      default:
        break;
    }
  }

  // ② 獲得：お化けが駒に吸い込まれ、点数が浮かぶ（rules v0.2 §6）。
  // 盤面は選択後の局面で描くため、獲得されたお化けは盤から消えている。獲得の演出が始まるまでは、
  // 一時的な絵で元の場所に見せておく。ただし、この選択で運ばれてきたお化けは移動の絵と重ならないよう隠しておく。
  const carried = new Set<ChipId>(
    events
      .filter((e): e is Extract<GameEvent, { type: 'ghostMoved' }> => e.type === 'ghostMoved' && !e.blocked)
      .map((e) => e.chip),
  );
  let acquireEnd = moveEnd;
  events
    .filter((e): e is Extract<GameEvent, { type: 'acquired' }> => e.type === 'acquired')
    .forEach((e, k) => {
      const delay = moveEnd + k * TIMING.acquireStagger;
      const player = piecePlacement(next, e.seat);
      const cell = next.players[e.seat]?.pos ?? prev.players[e.seat]?.pos;
      if (cell === undefined) return;
      e.chips.slice(0, 3).forEach((chip, i) => {
        const kind = kindOf.get(chip) ?? 'normal';
        const from = slotPos(cell, CHIP_SLOT[kind]);
        const id = `get-${chip}`;
        const [dx, dy] = delta(player, { x: from.x + i * 4, y: from.y });
        overlays.push({ id, kind: 'sprite', chipKind: kind, x: from.x + i * 4, y: from.y, size: 24 });
        steps.push({
          target: { type: 'fx', id },
          frames: [frame(0, 0, 1, carried.has(chip) ? 0 : 1), frame(0, -10, 1.15, 1, 0.35), frame(dx, dy, 0.3, 0)],
          delay: delay + i * 80,
          duration: TIMING.acquire,
        });
      });
      const id = `points-${e.seat}-${k}`;
      overlays.push({ id, kind: 'text', x: player.x, y: player.y - 18, text: `+${e.points}` });
      steps.push({ target: { type: 'fx', id }, frames: [frame(0, 6, 0.6, 0), frame(0, -4, 1.2, 1, 0.3), frame(0, -16, 1, 0)], delay, duration: TIMING.acquire + 150 });
      acquireEnd = Math.max(acquireEnd, delay + TIMING.acquire + 150);
    });

  // ③ 出現：新しいお化けが現れる（rules v0.2 §8.3）。同じ印に重なるお化けは 1 回だけ動かす。
  const appeared = new Set<string>();
  events
    .filter((e): e is Extract<GameEvent, { type: 'ghostPlaced' }> => e.type === 'ghostPlaced')
    .forEach((e, i) => {
      const group = `${e.cell}:${e.kind}`;
      if (appeared.has(group)) return;
      appeared.add(group);
      steps.push({
        target: { type: 'chip', chip: e.chip },
        frames: [frame(0, 0, 0, 0), frame(0, 0, 1.25, 1, 0.6), frame()],
        delay: acquireEnd + i * TIMING.appearStagger,
        duration: TIMING.appear,
      });
    });

  if (steps.length === 0) return null;
  const total = Math.max(...steps.map((s) => s.delay + s.duration)) + TIMING.tail;
  return { steps, overlays, total };
};
