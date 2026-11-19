// 合法手の種類（Target.type）と所作の対応表（design.md §8、decisions.md U-01）。
// 各画面部品は、この表で自分の領域に割り当てられた種類の合法手だけを描く。
import type { Target } from '../game/targets.ts';

/** 画面の領域 */
export type Area = 'hand' | 'board' | 'info' | 'controls';

export type Gesture = {
  area: Area;
  /** 所作の説明（「その他の操作」の一覧や説明文に使う） */
  description: string;
};

export const GESTURES: Readonly<Record<Target['type'], Gesture>> = {
  handCard: { area: 'hand', description: '手札のカードをタップする' },
  chip: { area: 'board', description: '盤上のお化けをタップする' },
  wraith: { area: 'board', description: '盤上の怨霊をタップする' },
  edge: { area: 'board', description: '盤上の辺をタップする' },
  heldChip: { area: 'info', description: '情報欄の自分のお化けをタップする' },
  button: { area: 'controls', description: 'ボタンを押す' },
};

export const areaOf = (target: Target): Area => GESTURES[target.type].area;
