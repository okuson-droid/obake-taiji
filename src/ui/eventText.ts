// 出来事（GameEvent）の表示文。呼び出し側で maskEvents を通した出来事を渡す（design.md §4.6）。
import { DIR_LABEL } from '../data/cards.ts';
import type { GameEvent } from '../game/types.ts';
import { cardFullName, seatName } from './labels.ts';

const EDGE_TEXT = (edge: string): string => {
  const [axis, cell] = edge.split(':');
  return axis === 'E' ? `${cell} の東の辺` : `${cell} の南の辺`;
};

/** 出来事を 1 行の文にする。表示しない出来事には null を返す。 */
export const eventText = (e: GameEvent): string | null => {
  switch (e.type) {
    case 'turnStarted':
      return `― ${e.turnNo} 手番目：${seatName(e.seat)} の番 ―`;
    case 'cardPlayed':
      return `${seatName(e.seat)} が「${cardFullName(e.card)}」を使った`;
    case 'humanMoved':
      return e.blocked
        ? `${seatName(e.seat)} は ${DIR_LABEL[e.facing]} を向いたが進めなかった`
        : `${seatName(e.seat)} が ${e.from} から ${e.to} へ進んだ`;
    case 'ghostMoved':
      return e.blocked ? `お化けは ${e.from} から動けなかった` : `お化けが ${e.from} から ${e.to} へ動いた`;
    case 'wraithMoved':
      return e.blocked ? `怨霊は ${e.from} から動けなかった` : `怨霊が ${e.from} から ${e.to} へ動いた`;
    case 'barrierPlaced':
      return `${EDGE_TEXT(e.edge)}に通せん棒を置いた`;
    case 'barrierRemoved':
      return `${EDGE_TEXT(e.edge)}の通せん棒を取り除いた`;
    case 'contact':
      return `怨霊と接触した：${e.seats.map(seatName).join('、')}`;
    case 'returnedToStart':
      return `${seatName(e.seat)} はスタート地点 ${e.to} に戻った`;
    case 'chipLost':
      return e.kind === null
        ? `${seatName(e.seat)} は失うお化けがなかった`
        : `${seatName(e.seat)} は${e.kind === 'golden' ? 'ゴールデンお化け' : 'お化け'}を 1 匹失った`;
    case 'acquired':
      return `${seatName(e.seat)} がお化けを ${e.chips.length} 匹つかまえた（+${e.points} 点）`;
    case 'overlapPurged':
      return `怨霊の部屋のお化け ${e.chips.length} 匹を取り除いた`;
    case 'ghostCardsRevealed':
      return `お化けカードを 3 枚めくった`;
    case 'ghostPlaced':
      return `${e.kind === 'golden' ? 'ゴールデンお化け' : 'お化け'}が ${e.cell} に現れた（${e.dice[0]}・${e.dice[1]}）`;
    case 'cardDrawn':
      return e.card === null ? `${seatName(e.seat)} がカードを 1 枚引いた` : `${seatName(e.seat)} が「${cardFullName(e.card)}」を引いた`;
    case 'moveDeckReshuffled':
      return '捨て札を切り直して山札にした';
    case 'gameEnded':
      return 'ゲーム終了';
  }
};
