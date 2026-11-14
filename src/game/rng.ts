// シード可能な乱数（design.md §6.2、decisions.md D-03）。
// どの関数も現在の内部状態を引数で受け取り、新しい内部状態を返す純粋関数である。
// 乱数の消費順は通信プロトコルの一部であり、変更しない。

/** 32 ビットの内部状態を uint32 に正規化する。createGame では rng = seed >>> 0 とする。 */
export const seedToState = (seed: number): number => seed >>> 0;

/**
 * mulberry32 を 1 段進める。
 * 戻り値は [0 以上 1 未満の値, 次の内部状態（uint32）] である。
 */
export const next = (state: number): [value: number, nextState: number] => {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, a];
};

/**
 * Fisher–Yates のシャッフル。i を末尾から 1 まで下げ、j = floor(next() * (i + 1)) として
 * i と j を入れ替える。引数の配列は変更せず、新しい配列を返す。
 */
export const shuffle = <T>(items: readonly T[], state: number): [shuffled: T[], nextState: number] => {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i >= 1; i--) {
    const [value, ns] = next(s);
    s = ns;
    const j = Math.floor(value * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return [out, s];
};

/** ダイスを 1 個振る。出目は floor(next() * 6) + 1 である。 */
export const rollDie = (state: number): [pip: number, nextState: number] => {
  const [value, ns] = next(state);
  return [Math.floor(value * 6) + 1, ns];
};
