import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const errors = [];
try {
  const contextA = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  for (const page of [a, b])
    page.on("pageerror", (e) => errors.push(e.message));
  async function enter(page, name) {
    await page.goto(base);
    await page.getByLabel("プレイヤー名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "エントランスへ →" }).click();
    await page.getByRole("button", { name: "マッチング開始 →" }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".queue-bar .primary")?.disabled,
    );
  }
  await enter(a, "青のテスター");
  await enter(b, "赤のテスター");
  await a
    .getByRole("button", { name: "キャラクターを選択", exact: true })
    .click();
  await a
    .getByRole("dialog")
    .getByRole("button", { name: /望月 千代/ })
    .click();
  assert.equal(
    await a.locator(".portrait-caption strong").textContent(),
    "望月 千代",
  );
  await a
    .locator("fieldset")
    .first()
    .getByRole("button", { name: /イグナイト/ })
    .click();
  assert.match(
    await a.locator("fieldset").nth(1).locator("legend").textContent(),
    /フラッシュ/,
  );
  await b.getByRole("button", { name: "ナディア", exact: true }).click();
  await a.getByLabel("音量設定", { exact: true }).click();
  await a.getByLabel("BGM音量").fill("20");
  await a.getByLabel("音量設定", { exact: true }).click();
  assert.equal(await a.evaluate(() => localStorage.getItem("moba.bgm")), "20");
  await mkdir("test-results", { recursive: true });
  await a.screenshot({ path: "test-results/entrance.png", fullPage: true });
  await a.getByRole("button", { name: "マッチング開始 →" }).click();
  await a.getByRole("button", { name: "待機をキャンセル" }).waitFor();
  assert.equal(
    await a
      .getByRole("button", { name: "キャラクターを選択", exact: true })
      .isDisabled(),
    true,
  );
  await a.getByRole("button", { name: "待機をキャンセル" }).click();
  await a.getByRole("button", { name: "マッチング開始 →" }).waitFor();
  const duplicate = await contextA.newPage();
  await duplicate.goto(base);
  await duplicate
    .getByLabel("プレイヤー名", { exact: true })
    .fill("同一セッション");
  await duplicate.getByRole("button", { name: "エントランスへ →" }).click();
  await duplicate.waitForFunction(
    () => document.querySelector(".connection")?.textContent === "Active: 2人",
  );
  await a.getByRole("button", { name: "マッチング開始 →" }).click();
  await duplicate.getByRole("button", { name: "待機をキャンセル" }).waitFor();
  await duplicate.close();
  await b.getByRole("button", { name: "マッチング開始 →" }).click();
  await Promise.all(
    [a, b].map((page) =>
      page
        .getByRole("heading", { name: "対戦準備完了", exact: true })
        .waitFor({ timeout: 15000 }),
    ),
  );
  for (const page of [a, b]) {
    assert.equal(await page.locator(".fighter").count(), 2);
    assert.equal(
      await page
        .locator(".load-status")
        .filter({ hasText: "ロード完了" })
        .count(),
      2,
    );
    assert.match(await page.locator(".versus").textContent(), /望月 千代/);
    assert.match(await page.locator(".versus").textContent(), /ナディア/);
  }
  assert.equal(
    await a.locator(".versus").innerText(),
    (await b.locator(".versus").innerText())
      .replaceAll("YOU", "TEMP")
      .replaceAll("OPPONENT", "YOU")
      .replaceAll("TEMP", "OPPONENT"),
  );
  await a.screenshot({ path: "test-results/matched.png", fullPage: true });
  a.once("dialog", (d) => d.accept());
  await a
    .getByRole("button", { name: "エントランスへ戻る", exact: true })
    .click();
  await Promise.all(
    [a, b].map((page) =>
      page.getByRole("button", { name: "マッチング開始 →" }).waitFor(),
    ),
  );
  await a.setViewportSize({ width: 1024, height: 576 });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await a.screenshot({
    path: "test-results/entrance-small.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: selection, spells, settings, cancel/requeue, shared tabs, isolated players, load/countdown, match exit, minimum viewport",
  );
} finally {
  await browser.close();
}
