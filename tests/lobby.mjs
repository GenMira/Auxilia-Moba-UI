import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const errors = [];
const seen = new Map();
const sent = [];
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
    page.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        const m = JSON.parse(f.payload);
        if (m.type === "world") seen.set(page === a ? "a" : "b", m);
      });
      ws.on("framesent", (f) => {
        const m = JSON.parse(f.payload);
        if (["move", "attack"].includes(m.type)) sent.push(m);
      });
    });
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
    [a, b].map((page) => page.locator(".match-screen").waitFor()),
  );
  for (const page of [a, b]) {
    assert.equal(await page.locator(".fighter").count(), 2);
    assert.match(await page.locator(".versus").textContent(), /望月 千代/);
    assert.match(await page.locator(".versus").textContent(), /ナディア/);
  }
  await a.screenshot({ path: "test-results/matched.png", fullPage: true });
  await Promise.all(
    [a, b].map((page) =>
      page
        .getByRole("region", { name: "ゲームシーン" })
        .waitFor({ timeout: 15000 }),
    ),
  );
  await a.screenshot({ path: "test-results/game-spawn.png", fullPage: true });
  async function moveTo(page, s, t) {
    const map = await page.locator(".minimap").boundingBox();
    const x = (s + t + 700) / 7400,
      y = (-s + t + 6700) / 7400;
    await page.mouse.click(map.x + map.width * x, map.y + map.height * y);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const box = await page.locator(".battle-viewport canvas").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: "right",
    });
    await page.mouse.move(box.x + box.width / 2, box.y - 10);
  }
  await moveTo(a, 2950, 0);
  await moveTo(b, 3050, 0);
  await Promise.all(
    [
      [a, sent.find((m) => m.type === "move").position.s],
      [b, sent.filter((m) => m.type === "move")[1].position.s],
    ].map(([page, s]) =>
      page.waitForFunction(
        (target) =>
          Math.abs(
            Number(document.querySelector(".game-scene")?.dataset.selfS) -
              target,
          ) < 8,
        s,
        { timeout: 25000 },
      ),
    ),
  );
  await a.getByRole("button", { name: "射程表示", exact: true }).click();
  await a.screenshot({ path: "test-results/game-mid.png", fullPage: true });
  async function attack(page, delta) {
    const box = await page.locator(".battle-viewport canvas").boundingBox();
    await page.mouse.click(
      box.x + box.width / 2 + (delta / Math.SQRT2) * 0.6,
      box.y + box.height / 2 - (delta / Math.SQRT2) * 0.6,
      { button: "right" },
    );
  }
  await attack(a, 100);
  await attack(b, -100);
  await b.waitForFunction(
    () => Number(document.querySelector(".game-scene")?.dataset.hp) <= 0,
    undefined,
    { timeout: 25000 },
  );
  await b.screenshot({ path: "test-results/game-death.png", fullPage: true });
  await b.reload();
  await b
    .getByRole("region", { name: "ゲームシーン" })
    .waitFor({ timeout: 10000 });
  await b.waitForFunction(
    () => {
      const g = document.querySelector(".game-scene");
      return (
        Number(g?.dataset.hp) > 0 &&
        Math.abs(
          Number(g?.dataset.selfS) - (g?.dataset.team === "blue" ? 200 : 5800),
        ) < 1
      );
    },
    undefined,
    { timeout: 10000 },
  );
  await a.keyboard.press("b");
  await a.waitForFunction(
    () => {
      const g = document.querySelector(".game-scene");
      return (
        Math.abs(
          Number(g?.dataset.selfS) - (g?.dataset.team === "blue" ? 200 : 5800),
        ) < 1
      );
    },
    undefined,
    { timeout: 11000 },
  );
  await a.setViewportSize({ width: 1024, height: 576 });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await a.screenshot({ path: "test-results/game-small.png", fullPage: true });
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "エントランス", exact: true }).click();
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
    "PASS: selection, spells, settings, cancel/requeue, shared tabs, isolated players, load/countdown, movement, combat, death/respawn, reconnect, recall, match exit, minimum viewport",
  );
} catch (error) {
  console.log("Last input:", JSON.stringify(sent));
  console.log(
    "Last world:",
    JSON.stringify(
      [...seen].map(([id, w]) => ({
        id,
        time: w.time,
        ack: w.ack,
        actors: w.actors.map((a) => ({
          id: a.id,
          s: a.position.s,
          t: a.position.t,
          moving: a.moving,
          hp: a.hp,
        })),
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
