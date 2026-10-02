import { mountRenderer } from "./gameRenderer";
import { useEffect, useRef, useState } from "react";
import { asset, characters, spells as spellCatalog } from "./catalog";
import { mini, project, unproject } from "./world";
import type { Point, World } from "./world";
import "./GameScene.css";

type Props = {
  world: World;
  selfId: string;
  spells: string[];
  connected: boolean;
  input: (command: object) => void;
};
const teamColor = (team: string) => (team === "blue" ? "#79c9ef" : "#f08d82");
export function GameScene(props: Props) {
  const { world, selfId, connected } = props;
  const self = world.actors.find((a) => a.id === selfId)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const previous = useRef<World | null>(null);
  const arrived = useRef(0);
  const camera = useRef({
    x: project(self.position).x,
    y: project(self.position).y,
    zoom: 0.6,
    locked: true,
    space: false,
    width: 1,
    height: 1,
  });
  const marker = useRef<{ point: Point; at: number } | null>(null);
  const keys = useRef(new Set<string>());
  const mouse = useRef({ x: 0, y: 0, inside: false });
  const [locked, setLocked] = useState(true);
  const [zoom, setZoom] = useState(0.6);
  const [showRange, setShowRange] = useState(false);
  const range = useRef(false);
  const [selectedId, setSelectedId] = useState("");
  const [aimSlot, setAimSlot] = useState("");
  const aim = useRef("");
  const [skillNotice, setSkillNotice] = useState("");
  function chooseSkill(slot: string) {
    const p = latest.current;
    const actor = p.world.actors.find((a) => a.id === p.selfId)!;
    const skill = actor.skills?.find((s) => s.slot === slot);
    const reason = !p.connected
      ? "接続待ち"
      : skill?.reason || (!skill ? "未実装" : "");
    if (reason) {
      setSkillNotice(reason);
      return;
    }
    setSkillNotice("");
    if (skill!.aim === "self") {
      aim.current = "";
      setAimSlot("");
      p.input({ type: "cast", slot, matchId: p.world.matchId });
    } else {
      aim.current = slot;
      setAimSlot(slot);
    }
  }
  // A stable handler reads current snapshots from refs, including after reconnect.
  const chooseSkillRef = useRef(chooseSkill);
  useEffect(() => {
    chooseSkillRef.current = chooseSkill;
  });
  useEffect(() => {
    if (props.world !== latest.current.world) {
      previous.current = latest.current.world;
      arrived.current = performance.now();
    }
    latest.current = props;
  }, [props]);
  function order(type: string, extra: object = {}) {
    if (connected) props.input({ type, matchId: world.matchId, ...extra });
  }
  function locate(clientX: number, clientY: number): Point {
    const rect = canvas.current!.getBoundingClientRect();
    const c = camera.current;
    return unproject(
      (clientX - rect.left - c.width / 2) / c.zoom + c.x,
      (clientY - rect.top - c.height / 2) / c.zoom + c.y,
    );
  }
  function pickActor(clientX: number, clientY: number, enemiesOnly = false) {
    const rect = canvas.current!.getBoundingClientRect(),
      c = camera.current;
    const x = clientX - rect.left,
      y = clientY - rect.top;
    return [...world.actors]
      .sort((a, b) => project(b.position).y - project(a.position).y)
      .find((a) => {
        if (a.hp <= 0 || (enemiesOnly && a.id === selfId)) return false;
        const p = project(a.position),
          sx = (p.x - c.x) * c.zoom + c.width / 2,
          sy = (p.y - c.y) * c.zoom + c.height / 2;
        return (
          Math.abs(x - sx) <= 75 * c.zoom &&
          y >= sy - 148 * c.zoom &&
          y <= sy + 35 * c.zoom
        );
      });
  }
  useEffect(() => {
    const el = canvas.current!;
    const disposeRenderer = mountRenderer(el, {
      latest,
      previous,
      arrived,
      camera,
      marker,
      keys,
      mouse,
      range,
      aim,
    });
    const keydown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) ||
          e.target.isContentEditable)
      )
        return;
      const k = e.key.toLowerCase();
      if (
        [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      )
        e.preventDefault();
      keys.current.add(e.key);
      if (e.code === "Space") camera.current.space = true;
      if (e.repeat) return;
      if (k === "y") {
        camera.current.locked = !camera.current.locked;
        setLocked(camera.current.locked);
      }
      const p = latest.current;
      if (
        ["q", "w", "e"].includes(k) &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        chooseSkillRef.current(k);
        return;
      }
      if (k === "escape" || k === "s") {
        aim.current = "";
        setAimSlot("");
      }
      if (p.connected && ["s", "b"].includes(k))
        p.input({
          type: k === "s" ? "stop" : "recall",
          matchId: p.world.matchId,
        });
    };
    const keyup = (e: KeyboardEvent) => {
      keys.current.delete(e.key);
      if (e.code === "Space") camera.current.space = false;
    };
    const blur = () => {
      keys.current.clear();
      camera.current.space = false;
      mouse.current.inside = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.current.zoom = Math.max(
        0.5,
        Math.min(1, camera.current.zoom + (e.deltaY < 0 ? 0.05 : -0.05)),
      );
      setZoom(camera.current.zoom);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      disposeRenderer();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  const selected = world.actors.find((a) => a.id === selectedId);
  const character = characters.find((a) => a.id === self.character)!;
  const aiming =
    self.hp > 0 && !self.cast && connected
      ? self.skills?.find((s) => s.slot === aimSlot)
      : undefined;
  const time = `${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, "0")}`;
  return (
    <section
      className="game-scene"
      aria-label="ゲームシーン"
      data-self-s={self.position.s}
      data-self-t={self.position.t}
      data-hp={self.hp}
      data-team={self.team}
      data-mana={self.mana}
      data-cast={self.cast?.slot || ""}
    >
      <div className="battle-top">
        <span className="eyebrow">SINGLE LANE / {self.team.toUpperCase()}</span>
        <span>
          {time}　 ·　 {self.kills} K / {self.deaths} D
        </span>
        <div>
          <button
            onClick={() => {
              camera.current.locked = !camera.current.locked;
              setLocked(camera.current.locked);
            }}
          >
            Y {locked ? "追従 ON" : "追従 OFF"}
          </button>
          <button
            aria-pressed={showRange}
            onClick={() => {
              range.current = !range.current;
              setShowRange(range.current);
            }}
          >
            射程表示
          </button>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>
      <div className="battle-viewport">
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="戦場：右クリックで移動または敵へ通常攻撃"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            mouse.current = {
              x: e.clientX - r.left,
              y: e.clientY - r.top,
              inside: true,
            };
          }}
          onMouseLeave={() => {
            mouse.current.inside = false;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (aim.current) {
              aim.current = "";
              setAimSlot("");
              return;
            }
            const p = locate(e.clientX, e.clientY);
            const enemy = pickActor(e.clientX, e.clientY, true);
            if (enemy) {
              order("attack", { target: enemy.id });
              setSelectedId(enemy.id);
            } else {
              order("move", { position: p });
              marker.current = { point: p, at: e.timeStamp };
            }
          }}
          onClick={(e) => {
            if (aiming) {
              order("cast", {
                slot: aiming.slot,
                position: locate(e.clientX, e.clientY),
                target: pickActor(e.clientX, e.clientY, true)?.id,
              });
              aim.current = "";
              setAimSlot("");
              return;
            }
            setSelectedId(pickActor(e.clientX, e.clientY)?.id ?? "");
          }}
        />
        {(aiming || self.cast || skillNotice) && (
          <div className="skill-feedback" role="status">
            {self.cast
              ? `${self.skills?.find((s) => s.slot === self.cast!.slot)?.name || self.cast.slot} 発動中 ${Math.max(0, self.cast.endsAt - world.time).toFixed(1)}秒`
              : aiming
                ? `${aiming.name}：左クリックで確定・右クリック/Escで取消`
                : skillNotice}
          </div>
        )}
        {self.hp <= 0 && (
          <div className="death-overlay" role="status">
            <strong>戦闘不能</strong>
            <span>
              復活まで {Math.max(0, Math.ceil(self.respawnAt - world.time))} 秒
            </span>
          </div>
        )}
        {!connected && (
          <div className="connection-overlay" role="status">
            再接続中… 操作を停止しています
          </div>
        )}
        {selected && (
          <aside className="target-card">
            <strong>{selected.name}</strong>
            <span>
              {characters.find((c) => c.id === selected.character)?.name}
            </span>
            <span>
              HP {Math.ceil(selected.hp)} / {selected.stats.hp}
            </span>
          </aside>
        )}
        <svg
          className="minimap"
          viewBox="0 0 180 180"
          role="img"
          aria-label="ミニマップ：クリックでカメラ移動"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x =
              (((e.clientX - r.left) / r.width) * 7400) / Math.SQRT2 -
              700 / Math.SQRT2;
            const y =
              (((e.clientY - r.top) / r.height) * 7400) / Math.SQRT2 -
              6700 / Math.SQRT2;
            const p = unproject(x, y);
            const q = project({
              s: Math.max(0, Math.min(6000, p.s)),
              t: Math.max(-700, Math.min(700, p.t)),
            });
            camera.current.x = q.x;
            camera.current.y = q.y;
            camera.current.locked = false;
            setLocked(false);
          }}
        >
          <rect width="180" height="180" fill="#111c20" />
          <polygon
            points={[
              { s: 0, t: -700 },
              { s: 6000, t: -700 },
              { s: 6000, t: 700 },
              { s: 0, t: 700 },
            ]
              .map((p) => {
                const q = mini(p);
                return `${q.x},${q.y}`;
              })
              .join(" ")}
            fill="#4d5647"
            stroke="#81896f"
          />
          {world.map.bushes.map((b, i) => {
            const q = mini({
              s: (b.minS + b.maxS) / 2,
              t: (b.minT + b.maxT) / 2,
            });
            return (
              <rect
                key={i}
                x={q.x - 3}
                y={q.y - 5}
                width="6"
                height="10"
                fill="#8da274"
              />
            );
          })}
          {world.map.structures.map((o) => {
            const q = mini(o.position);
            return (
              <circle
                key={o.id}
                cx={q.x}
                cy={q.y}
                r={o.kind === "base" ? 4 : 3}
                fill={teamColor(o.team)}
              />
            );
          })}
          {world.actors
            .filter((a) => a.hp > 0)
            .map((a) => {
              const q = mini(a.position);
              return (
                <circle
                  key={a.id}
                  cx={q.x}
                  cy={q.y}
                  r="4"
                  fill={a.id === selfId ? "#f8e7a4" : teamColor(a.team)}
                  stroke="#131e23"
                />
              );
            })}
        </svg>
      </div>
      <footer className="battle-hud">
        <div className="hud-portrait">
          <img
            src={asset(`characters-mini/${self.character}_mini.png`)}
            alt={character.name}
          />
          <span>Lv.{self.level}</span>
        </div>
        <div className="hud-vitals">
          <strong>{character.name}</strong>
          <div className="meter hp">
            <i style={{ width: `${(self.hp / self.stats.hp) * 100}%` }} />
            <span>
              {Math.ceil(self.hp)} / {self.stats.hp}
            </span>
          </div>
          <div className="meter mana">
            <i style={{ width: `${(self.mana / self.stats.mana) * 100}%` }} />
            <span>
              {Math.ceil(self.mana)} / {self.stats.mana}
            </span>
          </div>
          <small>
            攻撃 {self.stats.attack}　速度 {Math.round(self.moveSpeed)}　射程{" "}
            {self.stats.range}U
          </small>
        </div>
        <div className="hud-abilities">
          {character.skills.map((name, i) => {
            const slot = "qwe"[i],
              skill = self.skills?.find((s) => s.slot === slot);
            const reason = !connected
              ? "接続待ち"
              : skill?.reason || (!skill ? "未実装" : "");
            return (
              <button
                key={name}
                className="skill-button"
                aria-label={`${slot.toUpperCase()} ${name}`}
                aria-pressed={aimSlot === slot}
                aria-disabled={!!reason}
                onClick={() => chooseSkill(slot)}
                title={
                  skill
                    ? `${skill.name} / ランク${skill.rank}\n${skill.description}\n${skill.shape === "heal" ? "回復" : "ダメージ"} ${Math.round(skill.amount)} / マナ${skill.mana} / CD${skill.cooldown}秒 / 発動${skill.duration}秒\n${reason || "使用可能"}`
                    : `${name}（未実装）`
                }
              >
                <kbd>{slot.toUpperCase()}</kbd>
                <small>
                  {skill ? `Lv.${skill.rank} · ${skill.mana}MP` : "未実装"}
                </small>
                {skill && (
                  <small>
                    {skill.readyAt > world.time
                      ? `${(skill.readyAt - world.time).toFixed(1)}s`
                      : reason || "使用可能"}
                  </small>
                )}
              </button>
            );
          })}
          {props.spells.map((id, i) => (
            <button
              disabled
              key={id}
              title={`${spellCatalog.find((s) => s.id === id)?.name}（未実装）`}
            >
              <kbd>{"DF"[i]}</kbd>
              <small>未実装</small>
            </button>
          ))}
          <button
            disabled={!connected || self.hp <= 0 || !!self.cast}
            onClick={() => order("recall")}
            title="8秒で本拠地へ。回復なし"
          >
            <kbd>B</kbd>
            <small>
              {self.recallUntil > 0
                ? `${Math.max(0, self.recallUntil - world.time).toFixed(1)}s`
                : "リコール"}
            </small>
          </button>
        </div>
        <div className="hud-inventory">
          <strong>{self.gold} G</strong>
          <div>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      </footer>
      <div className="status-strip" aria-label="パッシブ・状態効果">
        {self.character === "Sophie" && (
          <span title="敵キャラへの通常攻撃・スキル命中で移動速度+30、2秒。重複せず更新。">
            播種：命中時に加速
          </span>
        )}
        {self.character === "Jude" && (
          <span title="通常ダメージをイベントごとに10軽減。毒・確定ダメージは軽減しない。">
            受け身：通常ダメージ−10
          </span>
        )}
        {(self.statuses || []).map((s) => (
          <span key={`${s.source}:${s.id}`} className={`status-${s.kind}`}>
            {(
              {
                slow: "スロウ",
                speed: "移動加速",
                poison: "毒",
                stun: "スタン",
                silence: "サイレンス",
                root: "ルート",
                shield: "シールド",
                ignite: "イグナイト",
              } as Record<string, string>
            )[s.kind] || s.kind}
            {s.kind === "slow"
              ? ` ${Math.round(s.value * 100)}%`
              : s.kind === "speed"
                ? ` +${s.value}`
                : ""}{" "}
            · {Math.max(0, s.until - world.time).toFixed(1)}秒
          </span>
        ))}
      </div>
      <p className="battle-help">
        右クリック：移動 / 敵に通常攻撃　 Q/W/E：スキル　 左クリック：照準確定　
        Esc：照準取消　 S：停止　 B：リコール　 Y：カメラ切替　 Space：自分へ　
        ホイール：拡大縮小
      </p>
    </section>
  );
}
