// 選択肢 ID と画面上の対象の対応（design.md §4.3）。UI は合法手をこの対象の所作に割り当てる。
import { EDGE_IDS } from '../data/board.ts';
import type { ChipId, ChipKind, EdgeId, GameState, MoveCardId, OptionId } from './types.ts';

export type Target =
  | { type: 'handCard'; card: MoveCardId }
  | { type: 'chip'; chip: ChipId }
  | { type: 'wraith' }
  | { type: 'edge'; edge: EdgeId; mode: 'place' | 'remove' }
  | { type: 'heldChip'; kind: ChipKind }
  | { type: 'button'; action: 'overlapContinue' | 'overlapPurge' };

const isEdge = (id: string): id is EdgeId => (EDGE_IDS as readonly string[]).includes(id);

/**
 * 選択肢 ID が指す対象を返す。対象が局面に存在しない場合（手札にないカード、盤上にないチップ、
 * 盤外の辺）や、形式が正しくない場合は例外を投げる。
 */
export const targetOf = (state: GameState, option: OptionId): Target => {
  if (option.startsWith('play:')) {
    const card = option.slice('play:'.length) as MoveCardId;
    const seat = state.pending?.player ?? state.turn;
    if (!state.players[seat]?.hand.includes(card)) throw new Error(`${card} は席 ${seat + 1} の手札にない`);
    return { type: 'handCard', card };
  }
  if (option === 'ghost:wraith') return { type: 'wraith' };
  if (option.startsWith('ghost:')) {
    const chip = option.slice('ghost:'.length) as ChipId;
    if (!state.chips.some((c) => c.id === chip)) throw new Error(`チップ ${chip} はボード上にない`);
    return { type: 'chip', chip };
  }
  for (const mode of ['place', 'remove'] as const) {
    const prefix = `barrier:${mode}:`;
    if (option.startsWith(prefix)) {
      const edge = option.slice(prefix.length);
      if (!isEdge(edge)) throw new Error(`${edge} は盤内の辺ではない`);
      return { type: 'edge', edge, mode };
    }
  }
  switch (option) {
    case 'lose:normal':
      return { type: 'heldChip', kind: 'normal' };
    case 'lose:golden':
      return { type: 'heldChip', kind: 'golden' };
    case 'overlap:continue':
      return { type: 'button', action: 'overlapContinue' };
    case 'overlap:purge':
      return { type: 'button', action: 'overlapPurge' };
  }
  throw new Error(`選択肢 ${option} の形式が正しくない`);
};

/** 対象から選択肢 ID を作る。targetOf の逆である。 */
export const optionOfTarget = (target: Target): OptionId => {
  switch (target.type) {
    case 'handCard':
      return `play:${target.card}`;
    case 'chip':
      return `ghost:${target.chip}`;
    case 'wraith':
      return 'ghost:wraith';
    case 'edge':
      return `barrier:${target.mode}:${target.edge}`;
    case 'heldChip':
      return `lose:${target.kind}`;
    case 'button':
      return target.action === 'overlapContinue' ? 'overlap:continue' : 'overlap:purge';
  }
};
