// カードの静的データ（rules v0.1 §2.9・§2.10、design.md §3.2）。
// カード ID の割り当ては通信プロトコルの一部であり、変更しない。
import type { Dir, GhostCard, GhostCardId, HumanCardKind, MoveCard, MoveCardId } from '../game/types.ts';

/** 人間移動カードの種類。ID の割り当て順でもある。 */
export const HUMAN_CARD_KINDS: readonly HumanCardKind[] = ['front', 'back', 'right', 'left', 'N', 'E', 'S', 'W'];
/** お化け移動カードの方角。ID の割り当て順でもある。 */
export const GHOST_CARD_DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];

export const HUMAN_CARDS_PER_KIND = 15;
export const GHOST_MOVE_CARDS_PER_DIR = 10;
export const BARRIER_CARDS = 20;

/** 人間移動カードの表示名（design.md §3.2） */
export const HUMAN_CARD_LABEL: Readonly<Record<HumanCardKind, string>> = {
  front: '前',
  back: '後ろ',
  right: '右',
  left: '左',
  N: '北',
  E: '東',
  S: '南',
  W: '西',
};

/** 方角の表示名 */
export const DIR_LABEL: Readonly<Record<Dir, string>> = { N: '北', E: '東', S: '南', W: '西' };

const moveCardId = (n: number): MoveCardId => `M${String(n).padStart(3, '0')}`;
const ghostCardId = (n: number): GhostCardId => `G${String(n).padStart(2, '0')}`;

const buildMoveCards = (): MoveCard[] => {
  const cards: MoveCard[] = [];
  // M000〜M119：人間移動。front・back・right・left・N・E・S・W の順に各 15 枚。
  for (const kind of HUMAN_CARD_KINDS) {
    for (let i = 0; i < HUMAN_CARDS_PER_KIND; i++) {
      cards.push({ id: moveCardId(cards.length), type: 'human', kind });
    }
  }
  // M120〜M159：お化け移動。N・E・S・W の順に各 10 枚。
  for (const dir of GHOST_CARD_DIRS) {
    for (let i = 0; i < GHOST_MOVE_CARDS_PER_DIR; i++) {
      cards.push({ id: moveCardId(cards.length), type: 'ghost', dir });
    }
  }
  // M160〜M179：通せん棒。
  for (let i = 0; i < BARRIER_CARDS; i++) {
    cards.push({ id: moveCardId(cards.length), type: 'barrier' });
  }
  return cards;
};

/** 移動カード 180 枚。ID の昇順（M000〜M179）に並ぶ（rules v0.1 §2.9）。 */
export const MOVE_CARDS: readonly MoveCard[] = buildMoveCards();

/** ID から移動カードを引く表 */
export const MOVE_CARD_BY_ID: Readonly<Record<MoveCardId, MoveCard>> = Object.fromEntries(
  MOVE_CARDS.map((c) => [c.id, c]),
);

/** お化けカードの内訳。ID の割り当て順でもある（rules v0.1 §2.10）。 */
const GHOST_CARD_SPEC: readonly { count: number; normal: number; golden: number }[] = [
  { count: 10, normal: 1, golden: 0 }, // G00〜G09：お化け 1 匹
  { count: 10, normal: 2, golden: 0 }, // G10〜G19：お化け 2 匹
  { count: 7, normal: 3, golden: 0 }, // G20〜G26：お化け 3 匹
  { count: 3, normal: 0, golden: 1 }, // G27〜G29：ゴールデンお化け 1 匹
];

const buildGhostCards = (): GhostCard[] => {
  const cards: GhostCard[] = [];
  for (const spec of GHOST_CARD_SPEC) {
    for (let i = 0; i < spec.count; i++) {
      cards.push({ id: ghostCardId(cards.length), normal: spec.normal, golden: spec.golden });
    }
  }
  return cards;
};

/** お化けカード 30 枚。ID の昇順（G00〜G29）に並ぶ（rules v0.1 §2.10）。 */
export const GHOST_CARDS: readonly GhostCard[] = buildGhostCards();

/** ID からお化けカードを引く表 */
export const GHOST_CARD_BY_ID: Readonly<Record<GhostCardId, GhostCard>> = Object.fromEntries(
  GHOST_CARDS.map((c) => [c.id, c]),
);
