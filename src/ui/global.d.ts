// 画面の安全網（design.md §8）が数える、画面上に対象のない合法手の件数。受け入れ検査で 0 を確かめる。
export {};

declare global {
  interface Window {
    __fallbackCount: number;
  }
}
