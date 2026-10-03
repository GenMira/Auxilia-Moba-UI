import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "msedge",
  headless: true,
});
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const clients = [],
  errors = [];
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
    ["ナディア検証", "ナディア"],
    ["千代検証", "望月 千代"],
  ]) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await ctx.newPage();
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
    await page
      .getByRole("button", { name: "キャラクターを選択", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(character) })
      .click();
    if (character === "望月 千代") {
      await page
        .locator("fieldset")
        .first()
        .getByRole("button", { name: /バリア/ })
        .click();
      await page
        .locator("fieldset")
        .nth(1)
        .getByRole("button", { name: /フラッシュ/ })
        .click();
    }
    await page.getByRole("button", { name: "マッチング開始 →" }).click();
  }
  const [a, b] = clients;
  await Promise.all(
    clients.map((c) =>
      c.page.getByRole("region", { name: "ゲームシーン" }).waitFor(),
    ),
  );
  async function move(c, s, t = 0) {
    const map = await c.page.locator(".minimap").boundingBox();
    await c.page.mouse.click(
      map.x + (map.width * (s + t + 700)) / 7400,
      map.y + (map.height * (-s + t + 6700)) / 7400,
    );
    await frame(c.page);
    const box = await c.page.locator(".battle-viewport canvas").boundingBox();
    await c.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: "right",
    });
    await c.page.mouse.move(box.x + box.width / 2, box.y - 10);
    await until(
      () => {
        const dest = c.sent.filter((m) => m.type === "move").at(-1)?.position,
          p = c.self()?.position;
        return dest && p && Math.hypot(p.s - dest.s, p.t - dest.t) < 5;
      },
      "movement",
      25000,
    );
    await c.page
      .getByRole("button", { name: "Y 追従 OFF", exact: true })
      .click();
    await frame(c.page);
  }
  await Promise.all([move(a, 2950), move(b, 3350)]);
  async function cursor(c, position) {
    await frame(c.page);
    const box = await c.page.locator(".battle-viewport canvas").boundingBox(),
      p = c.self().position,
      ds = position.s - p.s,
      dt = position.t - p.t;
    const x = box.x + box.width / 2 + ((ds + dt) / Math.SQRT2) * 0.6,
      y = box.y + box.height / 2 + ((-ds + dt) / Math.SQRT2) * 0.6;
    await c.page.mouse.move(x, y);
    return { x, y };
  }
  async function ability(c, slot, position) {
    const spell = "df".includes(slot),
      v = [...c.self().skills, ...c.self().spells].find((s) => s.slot === slot),
      before = c.sent.length;
    if (position) await cursor(c, position);
    await c.page.keyboard.press(slot);
    if (v.aim !== "self" && v.shape !== "blink") {
      await c.page
        .locator(".skill-feedback")
        .filter({ hasText: "左クリック" })
        .waitFor();
      const p = await cursor(c, position);
      await c.page.mouse.click(p.x, p.y);
    }
    await until(
      () =>
        c.sent.slice(before).some((m) => m.type === (spell ? "spell" : "cast")),
      `send ${slot}`,
    );
    const cmd = c.sent
      .slice(before)
      .find((m) => m.type === (spell ? "spell" : "cast"));
    await until(
      () => c.results.some((r) => r.sequence === cmd.sequence),
      `ack ${slot}`,
    );
    assert(c.results.find((r) => r.sequence === cmd.sequence).ok);
    await until(
      () =>
        [...c.self().skills, ...c.self().spells].find((s) => s.slot === slot)
          .readyAt > c.world.time && !c.self().cast,
      `complete ${slot}`,
    );
  }
  const old = a.self().position;
  await ability(a, "e", b.self().position);
  assert(
    Math.hypot(a.self().position.s - old.s, a.self().position.t - old.t) > 200,
  );
  await until(
    () => b.self().statuses.some((s) => s.kind === "poison"),
    "E poison",
  );
  await ability(a, "q");
  await ability(a, "w", b.self().position);
  await ability(b, "d");
  await ability(a, "f", b.self().position);
  await until(
    () => b.self().statuses.some((s) => s.kind === "shield" && s.value < 100),
    "shield absorbs DoT",
    3000,
  );
  await ability(b, "q", a.self().position);
  await ability(b, "w", a.self().position);
  await ability(b, "e", a.self().position);
  const beforeFlash = { ...a.self().position },
    mana = a.self().mana;
  await ability(a, "d", { s: beforeFlash.s - 400, t: beforeFlash.t });
  assert(
    Math.hypot(
      a.self().position.s - beforeFlash.s,
      a.self().position.t - beforeFlash.t,
    ) > 390,
  );
  assert(a.self().mana >= mana);
  await mkdir("test-results", { recursive: true });
  await b.page.screenshot({
    path: "test-results/stage3-combat.png",
    fullPage: true,
  });
  const savedCD = b.self().spells.map((s) => s.readyAt);
  b.world = null;
  await b.page.reload();
  await until(() => b.self()?.spells?.length === 2, "reconnect");
  assert.deepEqual(
    b.self().spells.map((s) => s.readyAt),
    savedCD,
  );
  await b.page.getByRole("region", { name: "ゲームシーン" }).waitFor();
  // Three real kills reach level 3 (300 XP), making the two earned points usable.
  for (let kill = 1; kill <= 3; kill++) {
    if (a.self().hp <= 0) await until(() => a.self().hp > 0, "respawn", 10000);
    await move(a, b.self().position.s - 150, b.self().position.t);
    const p = await cursor(b, a.self().position);
    await b.page.mouse.click(p.x, p.y, { button: "right" });
    await b.page.mouse.move(p.x, p.y - 5);
    await until(() => b.self().kills >= kill, `kill ${kill}`, 45000);
  }
  await until(() => b.self().level === 3, "level 3");
  assert.equal(b.self().skillPoints, 2);
  await b.page.keyboard.press("Control+q");
  await until(() => b.self().skills[0].rank === 2, "Ctrl Q upgrade");
  await b.page.getByRole("button", { name: "Wを強化", exact: true }).click();
  await until(() => b.self().skills[1].rank === 2, "HUD upgrade");
  assert.equal(b.self().skillPoints, 0);
  assert(
    await b.page
      .getByRole("button", { name: "Qを強化", exact: true })
      .isDisabled(),
  );
  await b.page.setViewportSize({ width: 1024, height: 576 });
  assert(
    await b.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await b.page.screenshot({
    path: "test-results/stage3-growth.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  b.page.once("dialog", (d) => d.accept());
  await b.page
    .getByRole("button", { name: "エントランス", exact: true })
    .click();
  console.log(
    "PASS: Nadia/Chiyo QWE, poison, blinks, flash/ignite/barrier, cooldown reconnect, three kills, Ctrl/HUD upgrades, minimum viewport",
  );
} catch (error) {
  console.log(
    clients.map((c) => ({ self: c.self(), results: c.results.slice(-5) })),
  );
  throw error;
} finally {
  await browser.close();
}
