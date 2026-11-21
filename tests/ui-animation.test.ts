// 演出の計画（src/ui/animation.ts）。出来事（GameEvent）だけから動きを決め、ルールを計算しないことを確かめる。
// 対応する rules v0.2 の条項は各テストに書く。
import { describe, expect, test } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine.ts';
import { TIMING, planAnimation, type AnimStep } from '../src/ui/animation.ts';
import { SIZE } from '../src/ui/boardGeometry.ts';
import { arrange, cardIds, finish, play, randomPicker } from './helpers.ts';

const stepsFor = (steps: AnimStep[], type: AnimStep['target']['type']) => steps.filter((s) => s.target.type === type);

describe('演出の計画（animation.ts）', () => {
  test('§5.1 人間移動：駒は元の部屋の位置から現在の位置へ動く', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'F6' }, { cell: 'A2' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const s1 = applyMove(s0, play(card));
    const plan = planAnimation(s0, s1)!;
    const [move] = stepsFor(plan.steps, 'piece');
    expect(move?.target).toEqual({ type: 'piece', seat: 0 });
    expect(move?.frames[0]).toMatchObject({ dx: -SIZE, dy: 0 });
    expect(move?.frames.at(-1)).toMatchObject({ dx: 0, dy: 0 });
    expect(move?.duration).toBe(TIMING.move);
  });

  test('§5.1 手順 3：壁で進めない駒は、向いた方へ押して戻る', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F6' }, { cell: 'B2' }], seats: { 0: { hand: [card] } } });
    const plan = planAnimation(s0, applyMove(s0, play(card)))!;
    const [bump] = stepsFor(plan.steps, 'piece');
    expect(bump?.frames.some((f) => f.dy < 0)).toBe(true);
    expect(bump?.frames.at(-1)).toMatchObject({ dx: 0, dy: 0 });
  });

  test('§7.2(a) 怨霊の部屋に入った駒は、そこまで動いてからスタート地点へ戻り、接触の輪を出す', () => {
    const ids = cardIds();
    const card = ids.human('N');
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    const plan = planAnimation(s0, applyMove(s0, play(card)))!;
    const [move] = stepsFor(plan.steps, 'piece');
    expect(move?.duration).toBe(TIMING.contact);
    expect(move?.frames.at(-1)).toMatchObject({ dx: 0, dy: 0 });
    // 最初は C4（スタート地点 A1 から右へ 2 部屋、下へ 3 部屋）にいる。
    expect(move?.frames[0]).toMatchObject({ dx: 2 * SIZE, dy: 3 * SIZE });
    expect(plan.overlays.some((o) => o.kind === 'ring')).toBe(true);
  });

  test('§5.4 お化け移動：選んだお化けが動く。壁なら揺れるだけ', () => {
    const ids = cardIds();
    const g = ids.ghost('S');
    const s0 = arrange({ chips: [{ cell: 'D2' }, { cell: 'C6' }], seats: { 0: { hand: [g] } } });
    const mid = applyMove(s0, play(g));
    const moved = planAnimation(mid, applyMove(mid, 'ghost:c1'))!;
    expect(stepsFor(moved.steps, 'chip')[0]).toMatchObject({ target: { type: 'chip', chip: 'c1' } });
    expect(stepsFor(moved.steps, 'chip')[0]?.frames[0]).toMatchObject({ dx: 0, dy: -SIZE });
    const blocked = planAnimation(mid, applyMove(mid, 'ghost:c2'))!;
    expect(stepsFor(blocked.steps, 'chip')[0]?.frames.every((f) => f.dy === 0)).toBe(true);
  });

  test('§7.1・§7.2(b) 怨霊が動き、入った部屋の駒はスタート地点へ戻る', () => {
    const ids = cardIds();
    const g = ids.ghost('E');
    const s0 = arrange({ chips: [{ cell: 'F1' }], seats: { 0: { hand: [g] }, 1: { pos: 'D3' } } });
    const mid = applyMove(s0, play(g));
    const plan = planAnimation(mid, applyMove(mid, 'ghost:wraith'))!;
    expect(stepsFor(plan.steps, 'wraith')[0]?.frames[0]).toMatchObject({ dx: -SIZE, dy: 0 });
    const piece = stepsFor(plan.steps, 'piece')[0];
    expect(piece?.target).toEqual({ type: 'piece', seat: 1 });
    expect(piece?.duration).toBe(TIMING.contact);
  });

  test('§7.3 スタート地点に入れない怨霊は、その場で揺れる', () => {
    const ids = cardIds();
    const g = ids.ghost('W');
    const s0 = arrange({ wraith: 'B1', chips: [{ cell: 'F3' }], seats: { 0: { hand: [g] } } });
    const mid = applyMove(s0, play(g));
    const plan = planAnimation(mid, applyMove(mid, 'ghost:wraith'))!;
    expect(stepsFor(plan.steps, 'wraith')[0]?.frames.every((f) => f.dy === 0)).toBe(true);
    expect(stepsFor(plan.steps, 'piece')).toEqual([]);
  });

  test('§5.5(a) 通せん棒の設置：置いた板が打ち付けられるように現れる', () => {
    const ids = cardIds();
    const b = ids.barrier();
    const s0 = arrange({ chips: [{ cell: 'F3' }], seats: { 0: { hand: [b] } } });
    const mid = applyMove(s0, play(b));
    const plan = planAnimation(mid, applyMove(mid, 'barrier:place:E:C3'))!;
    const [step] = stepsFor(plan.steps, 'barrier');
    expect(step?.target).toEqual({ type: 'barrier', edge: 'E:C3' });
    expect(step?.frames[0]?.opacity).toBe(0);
    expect(step?.frames.at(-1)).toMatchObject({ dx: 0, dy: 0, scale: 1, opacity: 1 });
  });

  test('§5.5(b) 通せん棒の撤去：外した板を一時的な絵で消していく', () => {
    const ids = cardIds();
    const b = ids.barrier();
    const s0 = arrange({ barriers: ['S:D2'], chips: [{ cell: 'F3' }], seats: { 0: { hand: [b] } } });
    const mid = applyMove(s0, play(b));
    const plan = planAnimation(mid, applyMove(mid, 'barrier:remove:S:D2'))!;
    expect(plan.overlays).toContainEqual(expect.objectContaining({ kind: 'plank', edge: 'S:D2' }));
  });

  test('§6 獲得：移動の後に、お化けが駒へ吸い込まれて点数が浮かぶ（rules v0.2：手番の終わりの選択の演出に入る）', () => {
    const ids = cardIds();
    const card = ids.human('E');
    const s0 = arrange({ chips: [{ cell: 'D4', kind: 'golden' }, { cell: 'D4' }, { cell: 'A5' }], seats: { 0: { pos: 'C4', hand: [card] } } });
    // 1 回目に移動し、2 回目（finish）で手番を終える。finish の events は 1 回目からの出来事をすべて含む。
    const plan = planAnimation(s0, finish(applyMove(s0, play(card))))!;
    const sprites = plan.overlays.filter((o) => o.kind === 'sprite');
    expect(sprites.map((o) => o.kind === 'sprite' && o.chipKind)).toEqual(['golden', 'normal']);
    expect(plan.overlays).toContainEqual(expect.objectContaining({ kind: 'text', text: '+4' }));
    const acquire = stepsFor(plan.steps, 'fx').filter((s) => s.target.type === 'fx' && s.target.id.startsWith('get-'));
    expect(Math.min(...acquire.map((s) => s.delay))).toBeGreaterThanOrEqual(TIMING.move);
    // 獲得の演出が始まるまでは、お化けを元の場所に見せておく（最初のコマが見えている）。
    for (const s of acquire) expect(s.frames[0]).toMatchObject({ dx: 0, dy: 0, opacity: 1 });
  });

  test('§8.3 出現：獲得の後に、新しいお化けが現れる', () => {
    const ids = cardIds();
    const card = ids.human('S');
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { pos: 'D3', hand: [card] } } });
    const s1 = finish(applyMove(s0, play(card)));
    const plan = planAnimation(s0, s1)!;
    const appear = stepsFor(plan.steps, 'chip');
    expect(appear.length).toBeGreaterThan(0);
    for (const s of appear) expect(s.frames[0]).toMatchObject({ scale: 0, opacity: 0 });
    const acquireEnd = Math.max(...stepsFor(plan.steps, 'fx').map((s) => s.delay + s.duration));
    expect(Math.min(...appear.map((s) => s.delay))).toBeGreaterThanOrEqual(acquireEnd);
    expect(plan.total).toBeGreaterThan(Math.max(...plan.steps.map((s) => s.delay + s.duration)));
  });

  test('§4.4 カードを選んだだけ（対象を選ぶ前）は演出しない', () => {
    const ids = cardIds();
    const g = ids.ghost('N');
    const s0 = arrange({ chips: [{ cell: 'D4' }], seats: { 0: { hand: [g] } } });
    expect(planAnimation(s0, applyMove(s0, play(g)))).toBeNull();
  });

  test('乱択プレイアウトのどの選択でも計画を作れ、演出の長さは 4 秒以内に収まる', () => {
    const pick = randomPicker(21);
    let s = createGame({ players: 3 }, 21);
    for (let i = 0; i < 1500 && s.result === null; i++) {
      const next = applyMove(s, pick(getOptions(s)));
      const plan = planAnimation(s, next);
      if (plan !== null) {
        expect(plan.total).toBeLessThanOrEqual(4000);
        for (const step of plan.steps) {
          expect(step.frames.length).toBeGreaterThanOrEqual(2);
          if (step.target.type === 'fx') expect(plan.overlays.some((o) => step.target.type === 'fx' && o.id === step.target.id)).toBe(true);
        }
      }
      s = next;
    }
  });
});
