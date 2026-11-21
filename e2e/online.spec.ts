// オンライン対戦の同期検査（design.md §9.3）。偽 DB（?db=fake）で 2〜4 ページをつなぎ、
// 各ページが自分の席の手番だけを data-option のタップで打って終局する。全ページの最終局面（GameState の JSON）が
// 一致することを確かめる。同じブラウザコンテキストのページは localStorage を共有する。
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors, picker, screenshotPath } from './app.ts';

const roomUrl = (seed: number): string => new URL(`../dist/index.html?db=fake&seed=${seed}#/`, import.meta.url).href;

/** ページの状態を 1 回の往復で調べる。 */
const look = (page: Page) =>
  page.evaluate(() => ({
    result: document.querySelector('[data-testid=game-result]') !== null,
    options: document.querySelectorAll('[data-option]').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    leaked: (() => {
      const own = new Set([...document.querySelectorAll('[data-option^="play:"]')].map((e) => e.getAttribute('data-option')!.slice(5)));
      return [...new Set(/* 画面は body の中だけにある。head には埋め込んだスクリプトがあり、調べる必要がない。 */ document.body.outerHTML.match(/M\d{3}/g) ?? [])].filter((id) => !own.has(id));
    })(),
    fallback: window.__fallbackCount,
  }));

/** 部屋を作り、残りのページを座らせて開始する。 */
const setUpRoom = async (context: BrowserContext, players: number, seed: number): Promise<Page[]> => {
  const pages = await Promise.all(Array.from({ length: players }, () => context.newPage()));
  const [host, ...guests] = pages;
  await host!.goto(roomUrl(seed));
  await host!.getByTestId(`online-players-${players}`).click();
  await host!.getByTestId('host-name').fill('席1の人');
  await host!.getByTestId('create-room').click();
  await expect(host!.getByTestId('lobby')).toBeVisible();
  const invite = (await host!.getByTestId('invite-url').textContent())!.trim();
  for (const [i, g] of guests.entries()) {
    await g.goto(invite);
    await g.getByTestId('join-name').fill(`席${i + 2}の人`);
    await g.getByTestId('join-room').click();
    await expect(g.getByTestId(`lobby-seat-${i + 2}`)).toContainText(`席${i + 2}の人`);
  }
  await host!.getByTestId('start-online').click();
  for (const p of pages) await expect(p.getByTestId('board')).toBeVisible();
  return pages;
};

/** 1 ページ分の打ち手。自分の番のときだけ打ち、終局したら抜ける。 */
const playOwnTurns = async (page: Page, seed: number): Promise<number> => {
  const pick = picker(seed);
  let taps = 0;
  for (;;) {
    const s = await look(page);
    expect(s.overflow, '横方向のはみ出し').toBe(false);
    expect(s.leaked, '他人の手札のカード ID').toEqual([]);
    expect(s.fallback, '安全網の件数').toBe(0);
    if (s.result) return taps;
    if (s.options === 0) {
      await page.waitForTimeout(20);
      continue;
    }
    // 自分の番のページを前面に出してから打つ。後ろのタブは描画が間引かれ、Playwright のクリックが
    // 要素の静止を待つ間に 1〜2 秒かかるためである（人が自分の端末を手に取って操作するのと同じ）。
    await page.bringToFront();
    await page.locator('[data-option]').nth(pick(s.options)).click();
    taps++;
  }
};

/**
 * [人数, シード]。2〜4 ページの両端（2 と 4）を打つ。3 ページも終局まで一致することを手元で確かめたが、
 * CI の所要時間を抑えるため常設の検査からは外した。rules v0.2 では乱択の 1 局が長くなりやすいため、
 * 4 ページは短く終わるシード 55 を使う（シード 33・44 は 8 分を超えた）。
 */
const ROOMS: [number, number][] = [
  [2, 11],
  [4, 55],
];

for (const [players, seed] of ROOMS) {
  test(`偽 DB で ${players} ページ（シード ${seed}）をつなぎ、各自の手番だけを打って終局し、全ページの最終局面が一致する`, async ({ context }) => {
    const started = Date.now();
    const pages = await setUpRoom(context, players, seed);
    const errors = pages.map(collectErrors);
    const taps = await Promise.all(pages.map((p, i) => playOwnTurns(p, seed * 10 + i)));
    const finals = await Promise.all(pages.map((p) => p.evaluate(() => window.__obakeState)));
    expect(finals[0]).toBeTruthy();
    for (const f of finals) expect(f).toBe(finals[0]);
    expect(JSON.parse(finals[0]!).result).not.toBeNull();
    await pages[0]!.screenshot({ path: screenshotPath(`online-${players}p-end`), fullPage: true });
    console.log(`オンライン ${players} 人・シード ${seed}：タップ ${taps.join('・')} 回・${((Date.now() - started) / 1000).toFixed(1)} 秒`);
    for (const e of errors) expect(e).toEqual([]);
  });
}

test('自分の番でないページには選択肢が出ず、手札のタップで理由を表示する', async ({ context }) => {
  const [host, guest] = await setUpRoom(context, 2, 44);
  await expect(guest!.getByTestId('prompt')).toHaveText(/席 1 が選んでいます/);
  expect(await guest!.locator('[data-option]').count()).toBe(0);
  await guest!.getByTestId('hand-card').first().click({ force: true });
  await expect(guest!.getByTestId('explain-message')).toHaveText('席 1 の手番です');
  await guest!.screenshot({ path: screenshotPath('online-waiting-375'), fullPage: true });
  expect(await host!.locator('[data-option]').count()).toBeGreaterThan(0);
});

test('部屋がなければ「見つかりません」と出し、満席の部屋には座れない', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(new URL('../dist/index.html?db=fake#/room/ZZZZZZ', import.meta.url).href);
  await expect(page.getByTestId('online-notice')).toContainText('見つかりません');
  const [host] = await setUpRoom(context, 2, 55);
  const invite = await host!.evaluate(() => window.location.href);
  const late = await context.newPage();
  await late.goto(invite);
  await expect(late.getByTestId('online-notice')).toContainText('観戦はできません');
});
