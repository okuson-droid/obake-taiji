// 駒とカードの絵（案 C「古い洋館」）。外部の画像やフォントは使わず、SVG だけで描く。
// 駒は viewBox 100×100、カードは 70×98 にそろえる。symbol の ID は「art-」に rules.md の機械的用語を続けて名付ける。
// パスの座標は 2 桁以下にとどめる（移動カード ID と同じ「M と数字 3 桁」の並びを DOM に作らないため）。
import type { ReactNode } from 'react';
import { MOVE_CARD_BY_ID } from '../../data/cards.ts';
import type { Dir, HumanCardKind, MoveCardId } from '../../game/types.ts';

/** 絵の色。盤と画面の配色（styles.css）と同じ値を使う。 */
export const ART = {
  ink: '#2b2418',
  sheet: '#ece6d6',
  sheetFold: '#b9b09a',
  gold: '#d9ad3c',
  goldFold: '#a37a1c',
  halo: '#f2d16b',
  cloak: '#2a1f35',
  void: '#0d0a12',
  eye: '#8cff9e',
  chain: '#9c9aa6',
  flame: '#ffb02e',
  candle: '#f6efd8',
  glow: '#ffd27a',
  parchment: '#f3ead2',
  human: '#7a2e2a',
  ghost: '#4b3a6b',
  ghostPaper: '#e6e0ee',
  barrier: '#5c4a2e',
  barrierPaper: '#ece5d3',
  plank: '#8a6a3e',
  rose: '#b9ab88',
} as const;

/** 駒の絵の定義。画面に 1 回だけ置き、盤面やカードから <use> で参照する。 */
export const ArtDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
    <defs>
      {/* お化け（通常、rules v0.1 §2.7）：シーツのお化け */}
      <symbol id="art-chip-normal" viewBox="0 0 100 100">
        <path
          d="M 50 14 C 30 14 24 34 24 52 C 24 66 18 78 14 86 C 24 84 26 90 34 86 C 40 92 46 86 50 90 C 56 86 60 92 66 86 C 74 90 78 84 86 86 C 82 78 76 66 76 52 C 76 34 70 14 50 14 Z"
          fill={ART.sheet}
          stroke={ART.ink}
          strokeWidth={4}
        />
        <path d="M 40 60 C 38 72 36 80 34 86 M 60 60 C 62 72 64 80 66 86" stroke={ART.sheetFold} strokeWidth={2.5} fill="none" />
        <ellipse cx={42} cy={42} rx={5.5} ry={7.5} fill={ART.ink} />
        <ellipse cx={58} cy={42} rx={5.5} ry={7.5} fill={ART.ink} />
      </symbol>
      {/* ゴールデンお化け（3 点）：金のシーツと光の輪 */}
      <symbol id="art-chip-golden" viewBox="0 0 100 100">
        <ellipse cx={50} cy={11} rx={18} ry={5.5} fill="none" stroke={ART.halo} strokeWidth={4.5} />
        <path
          d="M 50 18 C 30 18 24 36 24 54 C 24 68 18 80 14 88 C 24 86 26 92 34 88 C 40 94 46 88 50 92 C 56 88 60 94 66 88 C 74 92 78 86 86 88 C 82 80 76 68 76 54 C 76 36 70 18 50 18 Z"
          fill={ART.gold}
          stroke={ART.ink}
          strokeWidth={4}
        />
        <path d="M 40 62 C 38 74 36 82 34 88 M 60 62 C 62 74 64 82 66 88" stroke={ART.goldFold} strokeWidth={2.5} fill="none" />
        <ellipse cx={42} cy={45} rx={5.5} ry={7.5} fill={ART.ink} />
        <ellipse cx={58} cy={45} rx={5.5} ry={7.5} fill={ART.ink} />
      </symbol>
      {/* 怨霊（rules v0.1 §2.8）：頭巾の亡霊と鎖 */}
      <symbol id="art-wraith" viewBox="0 0 100 100">
        <path
          d="M 50 8 C 26 10 20 36 20 56 L 14 94 L 31 85 L 41 96 L 50 85 L 59 96 L 69 85 L 86 94 L 80 56 C 80 36 74 10 50 8 Z"
          fill={ART.cloak}
          stroke={ART.void}
          strokeWidth={3}
        />
        <path d="M 50 21 C 37 23 33 38 35 53 C 44 59 56 59 65 53 C 67 38 63 23 50 21 Z" fill={ART.void} />
        <ellipse cx={43.5} cy={41} rx={4} ry={2.8} fill={ART.eye} />
        <ellipse cx={56.5} cy={41} rx={4} ry={2.8} fill={ART.eye} />
        <path d="M 24 68 q 8 6 17 0 q 9 -6 18 0 q 8 6 17 0" stroke={ART.chain} strokeWidth={3.5} fill="none" strokeDasharray="5 3" />
      </symbol>
      {/* 人間駒（rules v0.1 §2.4）：上から見た探索者。東向きで描き、向きに応じて回す。
          マントの色は currentColor（席の色）。燭台の灯が向きを示す。 */}
      <symbol id="art-player" viewBox="0 0 100 100">
        <circle cx={86} cy={50} r={14} fill={ART.glow} opacity={0.45} />
        <circle cx={40} cy={50} r={32} fill="currentColor" stroke={ART.parchment} strokeWidth={4} />
        <circle cx={40} cy={50} r={18} fill="#000" opacity={0.3} />
        <circle cx={40} cy={50} r={18} fill="none" stroke={ART.parchment} strokeWidth={2} opacity={0.7} />
        <path d="M 72 50 h 9" stroke={ART.parchment} strokeWidth={4.5} strokeLinecap="round" />
        <rect x={80} y={43} width={9} height={14} rx={1.5} fill={ART.candle} stroke={ART.ink} strokeWidth={1.8} />
        <path d="M 84.5 43 q -3 -6 0 -10 q 3 4 0 10 z" fill={ART.flame} />
      </symbol>
    </defs>
  </svg>
);

/** 人間駒の回転角（東向きの絵を基準とし、時計回りの度数） */
export const FACING_ANGLE: Readonly<Record<Dir, number>> = { E: 0, S: 90, W: 180, N: 270 };

const DIR_ANGLE: Readonly<Record<Dir, number>> = { N: 0, E: 90, S: 180, W: 270 };
const DIR_NAME: Readonly<Record<Dir, string>> = { N: '北', E: '東', S: '南', W: '西' };
const RELATIVE_NAME: Readonly<Record<'front' | 'back' | 'right' | 'left', string>> = {
  front: '前',
  back: '後ろ',
  right: '右',
  left: '左',
};

/** 上向きの矢じり（x, y が先端） */
const head = (x: number, y: number, color: string, angle = 0) => (
  <path
    d={`M ${x - 6} ${y + 7} L ${x} ${y} L ${x + 6} ${y + 7}`}
    fill="none"
    stroke={color}
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    transform={`rotate(${angle} ${x} ${y})`}
  />
);

/** 相対の移動（前・後ろ・右・左）：人の印から曲がる矢印（共通のアイコン文法） */
const RelativeIcon = ({ kind }: { kind: 'front' | 'back' | 'right' | 'left' }) => {
  const c = ART.ink;
  const stroke = { stroke: c, strokeWidth: 3.5, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'front':
      return (
        <g>
          <path d="M 35 56 V 26" {...stroke} />
          {head(35, 24, c)}
          <circle cx={35} cy={60} r={6} fill={ART.human} />
        </g>
      );
    case 'back':
      return (
        <g>
          <path d="M 27 56 V 36 a 8 8 0 0 1 16 0 V 54" {...stroke} />
          {head(43, 58, c, 180)}
          <circle cx={27} cy={60} r={6} fill={ART.human} />
        </g>
      );
    case 'right':
      return (
        <g>
          <path d="M 28 56 V 40 q 0 -10 12 -10 H 48" {...stroke} />
          {head(51, 30, c, 90)}
          <circle cx={28} cy={60} r={6} fill={ART.human} />
        </g>
      );
    case 'left':
      return (
        <g>
          <path d="M 42 56 V 40 q 0 -10 -12 -10 H 22" {...stroke} />
          {head(19, 30, c, 270)}
          <circle cx={42} cy={60} r={6} fill={ART.human} />
        </g>
      );
  }
};

/** 絶対の移動（東西南北）：方位盤の 1 方向を塗る（共通のアイコン文法） */
const CompassIcon = ({ dir, color }: { dir: Dir; color: string }) => (
  <g>
    <circle cx={35} cy={43} r={18} fill="none" stroke={ART.ink} strokeWidth={1.6} />
    {(['N', 'E', 'S', 'W'] as Dir[]).map((d) => (
      <path
        key={d}
        d="M 35 26 L 38.5 40 L 35 43 L 31.5 40 Z"
        fill={d === dir ? color : ART.rose}
        stroke={d === dir ? ART.ink : 'none'}
        strokeWidth={0.8}
        transform={`rotate(${DIR_ANGLE[d]} 35 43)`}
      />
    ))}
    <text x={35} y={22} fontSize={6.5} fill={ART.ink} textAnchor="middle" opacity={0.7}>
      北
    </text>
  </g>
);

/** カードの枠（タロット風の縁取り） */
const Frame = ({ paper, line, label, title, children }: { paper: string; line: string; label: string; title: string; children: ReactNode }) => (
  <>
    <rect x={2} y={2} width={66} height={94} rx={4} fill={paper} stroke={ART.ink} strokeWidth={2} />
    <rect x={6} y={6} width={58} height={86} rx={2} fill="none" stroke={line} strokeWidth={1.2} />
    <path d="M 6 14 h 8 v -8 M 64 14 h -8 v -8 M 6 84 h 8 v 8 M 64 84 h -8 v 8" stroke={line} strokeWidth={1.2} fill="none" />
    <text x={35} y={14} fontSize={6.5} fill={line} textAnchor="middle" fontWeight={700} letterSpacing={0.6}>
      {label}
    </text>
    {children}
    <text x={35} y={83} fontSize={title.length > 2 ? 11 : 15} fill={ART.ink} textAnchor="middle" fontWeight={800} className="card-face-title">
      {title}
    </text>
  </>
);

/** 手札のカードの絵。種類と方角だけを描き、カード ID は描かない。 */
export const CardFace = ({ card }: { card: MoveCardId }) => {
  const def = MOVE_CARD_BY_ID[card];
  if (def === undefined) return null;
  let body: ReactNode;
  switch (def.type) {
    case 'human': {
      const kind: HumanCardKind = def.kind;
      const relative = kind === 'front' || kind === 'back' || kind === 'right' || kind === 'left';
      body = (
        <Frame paper={ART.parchment} line={ART.human} label="人間移動" title={relative ? RELATIVE_NAME[kind] : DIR_NAME[kind]}>
          {relative ? <RelativeIcon kind={kind} /> : <CompassIcon dir={kind} color={ART.human} />}
        </Frame>
      );
      break;
    }
    case 'ghost':
      body = (
        <Frame paper={ART.ghostPaper} line={ART.ghost} label="お化け移動" title={DIR_NAME[def.dir]}>
          <g transform={`rotate(${DIR_ANGLE[def.dir]} 35 44)`}>
            <path d="M 35 32 V 22" stroke={ART.ghost} strokeWidth={3.5} strokeLinecap="round" />
            {head(35, 20, ART.ghost)}
          </g>
          <use href="#art-chip-normal" x={22} y={31} width={26} height={26} />
        </Frame>
      );
      break;
    case 'barrier':
      body = (
        <Frame paper={ART.barrierPaper} line={ART.barrier} label="通せん棒" title="通せん棒">
          <path d="M 18 24 v 40 M 52 24 v 40" stroke={ART.rose} strokeWidth={2} />
          <rect x={13} y={35} width={44} height={9} fill={ART.plank} stroke={ART.ink} strokeWidth={1.6} transform="rotate(-12 35 39)" />
          <rect x={13} y={48} width={44} height={9} fill={ART.plank} stroke={ART.ink} strokeWidth={1.6} transform="rotate(10 35 52)" />
          <circle cx={24} cy={41} r={1.3} fill={ART.ink} />
          <circle cx={46} cy={53} r={1.3} fill={ART.ink} />
        </Frame>
      );
      break;
  }
  return (
    <svg viewBox="0 0 70 98" className="card-face" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
};
