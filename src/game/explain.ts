// 選べない理由の表示文（design.md §4.4）。表示専用であり、合法手の判定には使わない。
import { EDGE_IDS } from '../data/board.ts';
import { canPlaceBarrier, playerAt } from './queries.ts';
import { optionOfTarget, type Target } from './targets.ts';
import type { GameState, Pending, Seat } from './types.ts';

/** 選択待ちの種類ごとに、いま選ぶべきものを示す文 */
const PROMPT: Readonly<Record<Pending['kind'], string>> = {
  overlapChoice: '先に怨霊とお化けの重なりへの対応を選んでください',
  playCard: '使うカードを選んでください',
  ghostTarget: '動かすお化けか怨霊を選んでください',
  barrierTarget: '通せん棒を置く辺か、取り除く通せん棒を選んでください',
  penaltyChip: '失うチップを選んでください',
};

/**
 * viewer の席から見て element を選べない理由を返す。選べる場合は null を返す。
 */
export const explain = (state: GameState, viewer: Seat, element: Target): string | null => {
  if (state.result !== null) return 'ゲームは終了しました';
  const pending = state.pending;
  if (pending === null) return 'いまは選べません';
  if (pending.player !== viewer) {
    // 手番プレイヤー以外のペナルティ（rules v0.1 §7.2(b)）を待っている場合を区別する。
    return pending.player === state.turn
      ? `席 ${pending.player + 1} の手番です`
      : `席 ${pending.player + 1} の選択を待っています`;
  }
  if (pending.options.includes(optionOfTarget(element))) return null;

  switch (element.type) {
    case 'handCard':
      if (pending.kind !== 'playCard') return PROMPT[pending.kind];
      if (!playerAt(state, viewer).hand.includes(element.card)) return '手札にないカードです';
      break;
    case 'chip':
    case 'wraith':
      if (pending.kind !== 'ghostTarget') return 'お化け移動カードを使うと選べます';
      if (element.type === 'chip' && !state.chips.some((c) => c.id === element.chip)) {
        return 'そのお化けはボード上にいません';
      }
      break;
    case 'edge':
      if (pending.kind !== 'barrierTarget') return '通せん棒カードを使うと選べます';
      if (!EDGE_IDS.includes(element.edge)) return '外周の壁には置けません';
      if (element.mode === 'remove') {
        if (!state.barriers.includes(element.edge)) return '通せん棒が置かれていません';
        break;
      }
      if (state.barriers.includes(element.edge)) return 'すでに通せん棒があります';
      if (!canPlaceBarrier(state, element.edge)) return 'ここに置くと行き来できない部屋ができるため設置できません';
      break;
    case 'heldChip':
      if (pending.kind !== 'penaltyChip') return '怨霊と接触したときに選べます';
      break;
    case 'button':
      if (pending.kind !== 'overlapChoice') return PROMPT[pending.kind];
      break;
  }
  return 'いまは選べません';
};
