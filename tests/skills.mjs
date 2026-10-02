import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const errors = [];
const clients = [];
async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`Timed out: ${label}`);
}
async function frame(page) {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
try {
  for (const [name, character] of [
    ["スキル検証ソフィー", "ソフィー"],
    ["スキル検証ジュード", "ジュード"],
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    const c = {
      page,
      world: null,
      id: "",
      sent: [],
      results: [],
      self: () => c.world?.actors.find((a) => a.id === c.id),
    };
    clients.push(c);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        const m = JSON.parse(f.payload);
        if (m.type === "state") c.id = m.selfId;
        if (m.type === "world") c.world = m;
        if (m.type === "commandResult") c.results.push(m);
      });
      ws.on("framesent", (f) => c.sent.push(JSON.parse(f.payload)));
    });
    await page.goto(base);
    await page.getByLabel("プレイヤー名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "エントランスへ →" }).click();
    await page.getByRole("button", { name: character, exact: true }).click();
    await page.getByRole("button", { name: "マッチング開始 →" }).click();
  }
  const [a, b] = clients;
  await Promise.all(
    clients.map((c) =>
      c.page.getByRole("region", { name: "ゲームシーン" }).waitFor(),
    ),
  );
  async function move(c, s) {
    const map = await c.page.locator(".minimap").boundingBox();
    await c.page.mouse.click(
      map.x + (map.width * (s + 700)) / 7400,
      map.y + (map.height * (-s + 6700)) / 7400,
    );
    await frame(c.page);
    const box = await c.page.locator(".battle-viewport canvas").boundingBox();
    await c.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: "right",
    });
    await c.page.mouse.move(box.x + box.width / 2, box.y - 10);
  }
  await move(a, 2950);
  await move(b, 3100);
  await until(
    () =>
      clients.every((c) => {
        const target = c.sent.find((m) => m.type === "move")?.position,
          self = c.self();
        return (
          target &&
          self &&
          Math.hypot(self.position.s - target.s, self.position.t - target.t) < 8
        );
      }),
    "move to combat",
    25000,
  );
  for (const c of clients)
    await c.page
      .getByRole("button", { name: "Y 追従 OFF", exact: true })
      .click();
  async function aim(c, slot, target) {
    await c.page.keyboard.press(slot);
    await c.page
      .locator(".skill-feedback")
      .filter({ hasText: "左クリック" })
      .waitFor();
    await frame(c.page);
    const box = await c.page.locator(".battle-viewport canvas").boundingBox(),
      self = c.self().position;
    const ds = target.s - self.s,
      dt = target.t - self.t;
    await c.page.mouse.move(
      box.x + box.width / 2 + ((ds + dt) / Math.SQRT2) * 0.6,
      box.y + box.height / 2 + ((-ds + dt) / Math.SQRT2) * 0.6,
    );
    return {
      x: box.x + box.width / 2 + ((ds + dt) / Math.SQRT2) * 0.6,
      y: box.y + box.height / 2 + ((-ds + dt) / Math.SQRT2) * 0.6,
    };
  }
  const initialMana = a.self().mana;
  await aim(a, "q", b.self().position);
  await a.page.keyboard.press("Escape");
  await frame(a.page);
  assert.equal(a.sent.filter((m) => m.type === "cast").length, 0);
  assert.equal(a.self().mana, initialMana);
  await aim(a, "q", b.self().position);
  await a.page.mouse.click(600, 350, { button: "right" });
  assert.equal(a.sent.filter((m) => m.type === "cast").length, 0);
  await mkdir("test-results", { recursive: true });
  async function castSkill(c, slot, target) {
    const previous = c.sent.filter((m) => m.type === "cast").length;
    if (target) {
      const p = await aim(c, slot, target);
      await c.page.mouse.click(p.x, p.y);
    } else await c.page.keyboard.press(slot);
    await until(
      () => c.sent.filter((m) => m.type === "cast").length > previous,
      `send ${slot}`,
    );
    const cmd = c.sent.filter((m) => m.type === "cast").at(-1);
    await until(
      () => c.results.some((r) => r.sequence === cmd.sequence),
      `ack ${slot}`,
    );
    assert.equal(c.results.find((r) => r.sequence === cmd.sequence).ok, true);
  }
  let hp = b.self().hp;
  await castSkill(a, "q", b.self().position);
  await until(() => b.self().hp < hp - 70, "Sophie Q damage after mitigation");
  assert(a.self().statuses.some((s) => s.kind === "speed"));
  const count = a.sent.filter((m) => m.type === "cast").length;
  await a.page.keyboard.press("q");
  await a.page
    .locator(".skill-feedback")
    .filter({ hasText: "クールダウン中" })
    .waitFor();
  assert.equal(a.sent.filter((m) => m.type === "cast").length, count);
  await castSkill(b, "q", a.self().position);
  await until(
    () => a.self().statuses.some((s) => s.kind === "slow"),
    "Jude Q slow",
  );
  await castSkill(a, "w", b.self().position);
  await until(
    () => b.self().statuses.some((s) => s.kind === "slow"),
    "Sophie W slow",
  );
  hp = b.self().hp;
  await castSkill(b, "e");
  await until(
    () =>
      !b.self().cast &&
      !b.self().statuses.some((s) => s.kind === "slow") &&
      b.self().hp > hp + 60,
    "Jude E heal and cleanse",
  );
  const cooldown = b.self().skills.find((s) => s.slot === "e").readyAt;
  hp = b.self().hp;
  await castSkill(a, "e", b.self().position);
  await until(() => b.self().hp < hp - 145, "Sophie E projectile");
  hp = a.self().hp;
  await castSkill(b, "w");
  await until(() => a.self().hp < hp - 105, "Jude W circle");
  await a.page.screenshot({
    path: "test-results/skills-combat.png",
    fullPage: true,
  });
  await b.page.reload();
  await until(
    () => b.self()?.skills.find((s) => s.slot === "e")?.readyAt === cooldown,
    "reconnect cooldown",
  );
  await b.page.getByRole("region", { name: "ゲームシーン" }).waitFor();
  await b.page.setViewportSize({ width: 1024, height: 576 });
  assert(
    await b.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await b.page.screenshot({
    path: "test-results/skills-small.png",
    fullPage: true,
  });
  await until(
    () => a.self().skills.find((s) => s.slot === "q").reason === "",
    "Q ready",
    8000,
  );
  await aim(a, "q", b.self().position);
  await a.page.screenshot({
    path: "test-results/skills-aim.png",
    fullPage: true,
  });
  await a.page.keyboard.press("Escape");
  for (const c of clients) {
    assert.equal(c.self().skills.length, 3);
    assert(c.self().skills.every((s) => s.rank === 1));
  }
  assert.deepEqual(errors, []);
  a.page.once("dialog", (d) => d.accept());
  await a.page
    .getByRole("button", { name: "エントランス", exact: true })
    .click();
  await b.page.getByRole("button", { name: "マッチング開始 →" }).waitFor();
  console.log(
    "PASS: Sophie/Jude QWE, aiming/cancel, cooldown rejection, passives, slow/cleanse/heal, projectile, reconnect, minimum viewport",
  );
} catch (error) {
  console.log(
    clients.map((c) => ({
      self: c.self(),
      sent: c.sent.filter((m) => m.type === "cast"),
      results: c.results,
    })),
  );
  throw error;
} finally {
  await browser.close();
}
