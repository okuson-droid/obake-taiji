// 非公開情報の伏せ処理（design.md §4.6、rules v0.1 §3.4、decisions.md R-15）。
// 他人の手札は枚数だけを UI に渡し、カード ID・種類を画面と DOM に出さない。
import type { GameEvent, Seat } from './types.ts';

/** viewer 以外のプレイヤーが引いたカード（cardDrawn.card）を null に伏せた新しい配列を返す。 */
export const maskEvents = (events: readonly GameEvent[], viewer: Seat): GameEvent[] =>
  events.map((e) => (e.type === 'cardDrawn' && e.seat !== viewer ? { ...e, card: null } : e));
