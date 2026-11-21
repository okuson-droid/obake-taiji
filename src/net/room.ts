// オンライン同期の共有ドキュメントと Room インターフェース（design.md §7.1・§7.2）。
import type { GameConfig, GameState, OptionId } from '../game/types.ts';

export type SeatEntry = { uid: string; name: string };

/** 1 ゲーム＝1 行（rooms テーブル）の doc 列（design.md §7.1） */
export type RoomDoc = {
  schema: 1;
  rulesVersion: '0.2';
  status: 'lobby' | 'playing' | 'ended';
  /** 作成者の uid */
  host: string;
  config: GameConfig;
  seed: number;
  /** 長さは config.players */
  seats: (SeatEntry | null)[];
  /** 直近のチェックポイント */
  checkpoint: GameState | null;
  /** チェックポイント以降の選択肢 ID */
  moves: OptionId[];
};

/** 版の数え方：部屋がまだないときは 0、作った直後は 1 とし、書き込みのたびに 1 増える。 */
export type WriteResult = { ok: true; version: number } | { ok: false };

export interface Room {
  /** 部屋の内容と版の変化を受け取る。最初の 1 回は現在の値で呼ぶ。戻り値で購読をやめる。 */
  subscribe(listener: (doc: RoomDoc | null, version: number) => void): () => void;
  /** expectedVersion が現在の版と一致するときだけ書き込む。expectedVersion が 0 なら部屋を作る。 */
  write(doc: RoomDoc, expectedVersion: number): Promise<WriteResult>;
  /** 部屋を消す（作成者のみ） */
  clear(): Promise<void>;
  /** 読み込み→更新→write を、版の衝突時に最大 5 回やり直す。手番に関係しない書き込み（着席など）に使う。 */
  transact(update: (doc: RoomDoc | null) => RoomDoc | null): Promise<RoomDoc | null>;
}

/** 接続済みの部屋と、この端末の利用者の uid */
export type Connection = { room: Room; uid: string };

/** transact の共通の実装。read で現在の値を取り、update の結果を write する。 */
export const transactWith = async (
  read: () => Promise<{ doc: RoomDoc | null; version: number }>,
  write: (doc: RoomDoc, expected: number) => Promise<WriteResult>,
  update: (doc: RoomDoc | null) => RoomDoc | null,
): Promise<RoomDoc | null> => {
  for (let i = 0; i < 5; i++) {
    const { doc, version } = await read();
    const next = update(doc);
    if (next === null || next === doc) return doc;
    const r = await write(next, version);
    if (r.ok) return next;
  }
  throw new Error('部屋の更新がほかの書き込みと 5 回続けて重なった');
};
