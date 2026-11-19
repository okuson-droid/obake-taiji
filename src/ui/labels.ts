// 表示用の名前と色。ルールの判定には使わない。
import { DIR_LABEL, HUMAN_CARD_LABEL, MOVE_CARD_BY_ID } from '../data/cards.ts';
import type { MoveCardId, Seat } from '../game/types.ts';

/** 席の表示名（内部は 0 始まり、表示は 1 始まり） */
export const seatName = (seat: Seat | number): string => `席 ${seat + 1}`;

/** 席ごとの駒の色。白地の上で見分けやすい 4 色とする。 */
export const SEAT_COLORS: readonly string[] = ['#d1495b', '#2e6fd8', '#2a9d4b', '#c97a00'];

export const seatColor = (seat: Seat | number): string => SEAT_COLORS[seat] ?? '#555';

export type CardLabel = { title: string; kind: string };

/** カードの表示名。人間移動は「前」「東」など、お化け移動は方角、通せん棒は「通せん棒」とする。 */
export const cardLabel = (id: MoveCardId): CardLabel => {
  const card = MOVE_CARD_BY_ID[id];
  if (card === undefined) return { title: '？', kind: '' };
  switch (card.type) {
    case 'human':
      return { title: HUMAN_CARD_LABEL[card.kind], kind: '人間移動' };
    case 'ghost':
      return { title: DIR_LABEL[card.dir], kind: 'お化け移動' };
    case 'barrier':
      return { title: '通せん棒', kind: '通せん棒' };
  }
};

/** 「お化け移動（北）」のような一続きの表示名 */
export const cardFullName = (id: MoveCardId): string => {
  const l = cardLabel(id);
  if (l.kind === '通せん棒') return '通せん棒';
  return `${l.kind}（${l.title}）`;
};
