// 盤面（design.md §8）。6×6 の部屋、駒、お化け、怨霊、通せん棒を SVG で描く。
// 選べるかどうかは親から渡される合法手（getOptions・targetOf の結果）だけで決め、ルールを計算しない。
import type { ReactNode } from 'react';
import { COLS, EDGES, ROWS, START_CELLS } from '../data/board.ts';
import type { Target } from '../game/targets.ts';
import type { Cell, Chip, ChipKind, Dir, EdgeId, GameState, OptionId } from '../game/types.ts';
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

const DIR_VECTOR: Readonly<Record<Dir, [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/** 同じ部屋にいる駒の置き場所。1 人なら中央、複数なら四隅（design.md §8）。 */
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
      cells.push(
        <g key={cell}>
          <rect x={x} y={y} width={SIZE} height={SIZE} className={isStart ? 'cell start' : 'cell'} style={owner !== undefined ? { fill: `${seatColor(owner)}22` } : undefined} />
          {isStart && (
            <text x={x + SIZE / 2} y={y + SIZE / 2 + 4} className="start-label">
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
    return edge.startsWith('E:') ? (
      <line key={edge} x1={x + SIZE} y1={y + 2} x2={x + SIZE} y2={y + SIZE - 2} className="barrier" />
    ) : (
      <line key={edge} x1={x + 2} y1={y + SIZE} x2={x + SIZE - 2} y2={y + SIZE} className="barrier" />
    );
  });

  const chipTokens = [...groups.entries()].map(([key, chips]) => {
    const first = chips[0]!;
    const kind: ChipKind = first.kind;
    const { x, y } = cellPos(first.cell);
    const cx = x + SIZE / 2;
    const cy = kind === 'golden' ? y + 13 : y + SIZE - 13;
    const option: OptionId = `ghost:${first.id}`;
    const legal = p.options.has(option);
    const also = legal ? chips.slice(1).map((c): OptionId => `ghost:${c.id}`).filter((o) => p.options.has(o)) : [];
    const target: Target = { type: 'chip', chip: first.id };
    return (
      <g key={key} {...tapProps(legal ? option : null, target, p, 'chip', also)} aria-label={`${first.cell} の${kind === 'golden' ? 'ゴールデンお化け' : 'お化け'} ${chips.length} 匹`}>
        <circle cx={cx} cy={cy} r={13} className="hit" />
        <circle cx={cx} cy={cy} r={10} className={kind === 'golden' ? 'chip golden' : 'chip'} />
        <text x={cx} y={cy + 4} className="chip-count">
          {chips.length}
        </text>
      </g>
    );
  });

  const wraithPos = cellPos(state.wraith);
  const wraithLegal = p.options.has('ghost:wraith');
  const wraith = (
    <g {...tapProps(wraithLegal ? 'ghost:wraith' : null, { type: 'wraith' }, p, 'wraith')} aria-label={`怨霊 ${state.wraith}`}>
      <circle cx={wraithPos.x + SIZE / 2} cy={wraithPos.y + SIZE / 2} r={15} className="hit" />
      <path
        d={`M ${wraithPos.x + 30} ${wraithPos.y + 17} L ${wraithPos.x + 43} ${wraithPos.y + 30} L ${wraithPos.x + 30} ${wraithPos.y + 43} L ${wraithPos.x + 17} ${wraithPos.y + 30} Z`}
        className="wraith"
      />
      <text x={wraithPos.x + 30} y={wraithPos.y + 34} className="wraith-label">
        怨
      </text>
    </g>
  );

  const byCell = new Map<Cell, number[]>();
  for (const pl of state.players) byCell.set(pl.pos, [...(byCell.get(pl.pos) ?? []), pl.seat]);
  const pieces = state.players.map((pl) => {
    const { x, y } = cellPos(pl.pos);
    const together = byCell.get(pl.pos) ?? [];
    const [ox, oy] = together.length > 1 ? (CORNERS[pl.seat] ?? [30, 30]) : [30, 30];
    const cx = x + ox;
    const cy = y + oy;
    const [dx, dy] = DIR_VECTOR[pl.facing];
    return (
      <g key={pl.seat} aria-label={`${seatName(pl.seat)}の駒 ${pl.pos}`} data-testid={`piece-${pl.seat + 1}`}>
        <line x1={cx} y1={cy} x2={cx + dx * 15} y2={cy + dy * 15} stroke={seatColor(pl.seat)} strokeWidth={4} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={9} fill={seatColor(pl.seat)} className="piece" />
        <text x={cx} y={cy + 4} className="piece-label">
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
      {chipTokens}
      {wraith}
      {pieces}
      {edgeHits}
    </svg>
  );
};
