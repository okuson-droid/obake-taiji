// 共有ドキュメント（RoomDoc）の書き換え（design.md §7.3・§7.5）。いずれも純粋関数で、引数を変更しない。
// 局面の判定は src/game の関数だけで行う。不正な手は replay で弾く（decisions.md D-06）。
import { applyMove, createGame } from '../game/engine.ts';
import { isCheckpoint, replay, undoLast } from '../game/history.ts';
import type { GameConfig, GameState, OptionId, Seat } from '../game/types.ts';
import type { RoomDoc } from './room.ts';

/** 部屋コードに使う文字（英大文字と数字、design.md §7.4） */
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const ROOM_CODE = /^[A-Z0-9]{6}$/;

/** 名前の長さの上限 */
export const NAME_MAX = 12;

/** 部屋コードを crypto.getRandomValues で作る（decisions.md D-03 の例外）。 */
export const randomRoomCode = (): string =>
  [...crypto.getRandomValues(new Uint32Array(6))].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join('');

/** 名前の前後の空白を除き、長さを上限までにする。 */
export const normalizeName = (name: string): string => name.trim().slice(0, NAME_MAX);

/** 部屋を作る。席 1 に作成者を座らせる（design.md §7.5）。 */
export const newRoomDoc = (config: GameConfig, seed: number, host: string, name: string): RoomDoc => ({
  schema: 1,
  rulesVersion: '0.1',
  status: 'lobby',
  host,
  config: { players: config.players },
  seed,
  seats: Array.from({ length: config.players }, (_, i) => (i === 0 ? { uid: host, name: normalizeName(name) } : null)),
  checkpoint: null,
  moves: [],
});

/** uid の座っている席。座っていなければ null */
export const seatOf = (doc: RoomDoc, uid: string): Seat | null => {
  const i = doc.seats.findIndex((s) => s?.uid === uid);
  return i < 0 ? null : (i as Seat);
};

/**
 * 空席に座る。すでに自分の席があればそのまま返す（再読み込み後に戻れる）。
 * ロビー以外や満席のときも、変更せずにそのまま返す。
 */
export const joinSeat = (doc: RoomDoc, uid: string, name: string): RoomDoc => {
  if (seatOf(doc, uid) !== null || doc.status !== 'lobby') return doc;
  const i = doc.seats.indexOf(null);
  if (i < 0) return doc;
  const seats = doc.seats.map((s, j) => (j === i ? { uid, name: normalizeName(name) } : s));
  return { ...doc, seats };
};

/** 作成者が開始できるか（全席が埋まっている） */
export const canStart = (doc: RoomDoc, uid: string): boolean =>
  doc.status === 'lobby' && doc.host === uid && doc.seats.every((s) => s !== null);

/** ゲームを始める（design.md §7.5）。checkpoint = createGame(config, seed)、moves = [] */
export const startGame = (doc: RoomDoc): RoomDoc => ({
  ...doc,
  status: 'playing',
  checkpoint: createGame(doc.config, doc.seed),
  moves: [],
});

/** 共有ドキュメントの局面（design.md §7.3 の 1.）。不正な手が含まれていれば例外を投げる。 */
export const docState = (doc: RoomDoc): GameState | null => (doc.checkpoint === null ? null : replay(doc.checkpoint, doc.moves));

/**
 * uid のプレイヤーが option を選んだ後の共有ドキュメント（design.md §7.3 の 2.・3.・6.）。
 * 選択待ちの席に座っていない、または合法でない選択肢なら null を返す。
 */
export const applyChoice = (doc: RoomDoc, uid: string, option: OptionId): RoomDoc | null => {
  const state = docState(doc);
  if (doc.status !== 'playing' || state === null || state.pending === null) return null;
  if (seatOf(doc, uid) !== state.pending.player || !state.pending.options.includes(option)) return null;
  const next = applyMove(state, option);
  const status = next.result !== null ? 'ended' : 'playing';
  return isCheckpoint(state, next) ? { ...doc, status, checkpoint: next, moves: [] } : { ...doc, status, moves: [...doc.moves, option] };
};

/** 選び直し（U-03、design.md §7.3 の 5.）。選択待ちの席の人だけが、取り消せるときに取り消せる。 */
export const undoChoice = (doc: RoomDoc, uid: string): RoomDoc | null => {
  const state = docState(doc);
  if (doc.status !== 'playing' || doc.checkpoint === null || state?.pending === null || state === null) return null;
  if (seatOf(doc, uid) !== state.pending.player) return null;
  const moves = undoLast(doc.checkpoint, doc.moves);
  return moves === null ? null : { ...doc, moves };
};
