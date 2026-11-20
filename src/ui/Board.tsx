// 盤面（design.md §8）。6×6 の部屋、駒、お化け、怨霊、通せん棒を SVG で描く。
// 選べるかどうかは親から渡される合法手（getOptions・targetOf の結果）だけで決め、ルールを計算しない。
import type { ReactNode } from 'react';
import { COLS, EDGES, ROWS, START_CELLS } from '../data/board.ts';
import type { Target } from '../game/targets.ts';
import type { Cell, Chip, ChipKind, Dir, EdgeId, GameState, OptionId } from '../game/types.ts';
import { FACING_ANGLE } from './assets/art.tsx';
import { seatColor, seatName } from './labels.ts';

/** 見出しの幅と部屋の大きさ（viewBox の単位）。375px 幅で 1 単位がおよそ 0.92px になる。 */
const HEAD = 20;
const SIZE = 60;
const VIEW = HEAD + SIZE * 6;
/** 辺の当たり判定の幅。375px 幅でも 16px 以上になる（design.md §8）。 */
const EDGE_HIT = 20;

export type BoardPreview = { to: Cell; facing: Dir; blocked: boolean; contact: boolean };

export type BoardProps = {
  state: GameState;
  /** 盤面に割り当てられた合法手（選択肢 ID → 対象） */
  options: ReadonlyMap<OptionId, Target>;
  barrierMode: boolean;
  preview: BoardPreview | null;
  onChoose: (option: OptionId) => void;
  onExplain: (target: Target) => void;
};

const cellPos = (cell: Cell): { x: number; y: number } => ({
  x: HEAD + COLS.indexOf(cell[0] as (typeof COLS)[number]) * SIZE,
  y: HEAD + ROWS.indexOf(Number(cell.slice(1)) as (typeof ROWS)[number]) * SIZE,
});

/**
 * 部屋の中の置き場所（部屋は 60×60）。左に人間駒か怨霊（同じ部屋にはいない）、右の列にお化けを置き、
 * タップできるお化けと怨霊の当たり判定が重ならないようにする。
 * 駒は 1 人なら左の中ほど、複数なら四隅に置く（design.md §8）。
 */
const LEFT_SLOT: [number, number] = [22, 30];
const CHIP_SLOT: Readonly<Record<ChipKind, [number, number]>> = { golden: [45, 17], normal: [45, 43] };

const CORNERS: readonly [number, number][] = [
  [14, 14],
  [46, 14],
  [46, 46],
  [14, 46],
];

/** 選べる要素・選べない要素に共通の属性を付ける。 */
const tapProps = (option: OptionId | null, target: Target, p: BoardProps, testId: string, also: OptionId[] = []) =>
  option !== null
    ? {
        'data-testid': testId,
        'data-option': option,
        ...(also.length > 0 ? { 'data-also': also.join(' ') } : {}),
        onClick: () => p.onChoose(option),
        className: 'tap selectable',
      }
    : { 'data-testid': `${testId}-disabled`, onClick: () => p.onExplain(target), className: 'tap' };

export const Board = (p: BoardProps) => {
  const { state } = p;
  const startOwner = new Map<Cell, number>(state.players.map((pl) => [pl.start, pl.seat]));

  // 部屋ごと・種類ごとにチップをまとめる。同じ部屋の同じ種類のお化けは区別できないため 1 つの印で表す。
  const groups = new Map<string, Chip[]>();
  for (const chip of state.chips) {
    const key = `${chip.cell}:${chip.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), chip]);
  }

  const cells: ReactNode[] = [];
  for (const row of ROWS) {
    for (const col of COLS) {
      const cell: Cell = `${col}${row}`;
      const { x, y } = cellPos(cell);
      const owner = startOwner.get(cell);
      const isStart = START_CELLS.includes(cell);
      const dark = (COLS.indexOf(col) + ROWS.indexOf(row)) % 2 === 1;
      cells.push(
        <g key={cell}>
          <rect x={x} y={y} width={SIZE} height={SIZE} className={`cell${dark ? ' dark' : ''}${isStart ? ' start' : ''}`} />
          {owner !== undefined && <rect x={x} y={y} width={SIZE} height={SIZE} fill={seatColor(owner)} opacity={0.22} />}
          {isStart && (
            <text x={x + 5} y={y + SIZE - 5} className="start-label">
              {owner !== undefined ? `S${owner + 1}` : 'S'}
            </text>
          )}
        </g>,
      );
    }
  }

  const barriers = state.barriers.map((edge) => {
    const e = EDGES.find((d) => d.id === edge);
    if (e === undefined) return null;
    const { x, y } = cellPos(e.cells[0]);
    // 通せん棒は板を打ち付けた柵として描く（案 C）。
    return edge.startsWith('E:') ? (
      <g key={edge} className="barrier">
        <rect x={x + SIZE - 4} y={y + 3} width={8} height={SIZE - 6} rx={1.5} />
        <circle cx={x + SIZE} cy={y + 14} r={1.4} className="nail" />
        <circle cx={x + SIZE} cy={y + SIZE - 14} r={1.4} className="nail" />
      </g>
    ) : (
      <g key={edge} className="barrier">
        <rect x={x + 3} y={y + SIZE - 4} width={SIZE - 6} height={8} rx={1.5} />
        <circle cx={x + 14} cy={y + SIZE} r={1.4} className="nail" />
        <circle cx={x + SIZE - 14} cy={y + SIZE} r={1.4} className="nail" />
      </g>
    );
  });

  const chipTokens = [...groups.entries()].map(([key, chips]) => {
    const first = chips[0]!;
    const kind: ChipKind = first.kind;
    const { x, y } = cellPos(first.cell);
    // ゴールデンは右上、通常は右下に置く。
    const cx = x + CHIP_SLOT[kind][0];
    const cy = y + CHIP_SLOT[kind][1];
    const option: OptionId = `ghost:${first.id}`;
    const legal = p.options.has(option);
    const also = legal ? chips.slice(1).map((c): OptionId => `ghost:${c.id}`).filter((o) => p.options.has(o)) : [];
    const target: Target = { type: 'chip', chip: first.id };
    return (
      <g key={key} {...tapProps(legal ? option : null, target, p, 'chip', also)} aria-label={`${first.cell} の${kind === 'golden' ? 'ゴールデンお化け' : 'お化け'} ${chips.length} 匹`}>
        <circle cx={cx} cy={cy} r={12.5} className="hit" />
        <use href={kind === 'golden' ? '#art-chip-golden' : '#art-chip-normal'} x={cx - 12} y={cy - 12} width={24} height={24} className="float" />
        {chips.length > 1 && (
          <g className="count">
            <circle cx={cx + 8} cy={cy - 9} r={6.5} />
            <text x={cx + 8} y={cy - 5.8}>
              {chips.length}
            </text>
          </g>
        )}
      </g>
    );
  });

  const wraithPos = cellPos(state.wraith);
  const wraithLegal = p.options.has('ghost:wraith');
  const wraith = (
    <g {...tapProps(wraithLegal ? 'ghost:wraith' : null, { type: 'wraith' }, p, 'wraith')} aria-label={`怨霊 ${state.wraith}`}>
      <circle cx={wraithPos.x + LEFT_SLOT[0]} cy={wraithPos.y + LEFT_SLOT[1]} r={15} className="hit" />
      <use href="#art-wraith" x={wraithPos.x + LEFT_SLOT[0] - 18} y={wraithPos.y + LEFT_SLOT[1] - 18} width={36} height={36} className="float slow" />
    </g>
  );

  const byCell = new Map<Cell, number[]>();
  for (const pl of state.players) byCell.set(pl.pos, [...(byCell.get(pl.pos) ?? []), pl.seat]);
  const pieces = state.players.map((pl) => {
    const { x, y } = cellPos(pl.pos);
    const together = byCell.get(pl.pos) ?? [];
    const [ox, oy] = together.length > 1 ? (CORNERS[pl.seat] ?? LEFT_SLOT) : LEFT_SLOT;
    const cx = x + ox;
    const cy = y + oy;
    const size = together.length > 1 ? 28 : 44;
    // 席番号はマントの中心に置く。マントの中心は絵の中心から 0.10×size だけ後ろにずれており、回転に合わせて動かす。
    const rad = (FACING_ANGLE[pl.facing] * Math.PI) / 180;
    const lx = cx - size * 0.1 * Math.cos(rad);
    const ly = cy - size * 0.1 * Math.sin(rad);
    // 人間駒は東向きの絵を、向きに合わせて回す。燭台の灯が向きを示す（rules v0.1 §2.4）。
    return (
      <g key={pl.seat} aria-label={`${seatName(pl.seat)}の駒 ${pl.pos}`} data-testid={`piece-${pl.seat + 1}`} className="piece">
        <use
          href="#art-player"
          x={cx - size / 2}
          y={cy - size / 2}
          width={size}
          height={size}
          color={seatColor(pl.seat)}
          transform={`rotate(${FACING_ANGLE[pl.facing]} ${cx} ${cy})`}
        />
        <text x={lx} y={ly + 4.5} className="piece-label">
          {pl.seat + 1}
        </text>
      </g>
    );
  });

  let previewMark: ReactNode = null;
  if (p.preview !== null) {
    const { x, y } = cellPos(p.preview.to);
    previewMark = <rect x={x + 3} y={y + 3} width={SIZE - 6} height={SIZE - 6} className={p.preview.contact ? 'preview contact' : 'preview'} />;
  }

  // 通せん棒の選択中は、すべての辺に当たり判定を重ねる。選べない辺はタップで理由を表示する。
  const edgeHits = p.barrierMode
    ? EDGES.map((e) => {
        const { x, y } = cellPos(e.cells[0]);
        const present = state.barriers.includes(e.id);
        const mode = present ? 'remove' : 'place';
        const option: OptionId = `barrier:${mode}:${e.id}`;
        const legal = p.options.has(option);
        const target: Target = { type: 'edge', edge: e.id as EdgeId, mode };
        const rect = e.id.startsWith('E:')
          ? { x: x + SIZE - EDGE_HIT / 2, y: y + 6, width: EDGE_HIT, height: SIZE - 12 }
          : { x: x + 6, y: y + SIZE - EDGE_HIT / 2, width: SIZE - 12, height: EDGE_HIT };
        return (
          <rect
            key={e.id}
            {...rect}
            rx={4}
            {...tapProps(legal ? option : null, target, p, 'edge')}
            className={`edge-hit ${legal ? mode : 'disabled'}`}
            aria-label={`${e.id} ${legal ? (mode === 'place' ? '設置できる' : '撤去できる') : '選べない'}`}
          />
        );
      })
    : null;

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="board" role="img" aria-label="盤面" data-testid="board">
      {COLS.map((c, i) => (
        <text key={c} x={HEAD + i * SIZE + SIZE / 2} y={14} className="head">
          {c}
        </text>
      ))}
      {ROWS.map((r, i) => (
        <text key={r} x={10} y={HEAD + i * SIZE + SIZE / 2 + 4} className="head">
          {r}
        </text>
      ))}
      {cells}
      {previewMark}
      {barriers}
      {/* 駒はタップしないので下に置き、タップするお化けと怨霊を上に描く。 */}
      {pieces}
      {wraith}
      {chipTokens}
      {edgeHits}
    </svg>
  );
};
