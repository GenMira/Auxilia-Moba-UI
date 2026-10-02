import { asset, characters } from "./catalog";
import { project, unproject, interpolatePosition } from "./world";
import type { Actor, Point, World, SkillEffect } from "./world";
export type Camera = {
  x: number;
  y: number;
  zoom: number;
  locked: boolean;
  space: boolean;
  width: number;
  height: number;
};
type Ref<T> = { current: T };
export type RenderState = {
  latest: Ref<{ world: World; selfId: string }>;
  previous: Ref<World | null>;
  arrived: Ref<number>;
  camera: Ref<Camera>;
  marker: Ref<{ point: Point; at: number } | null>;
  keys: Ref<Set<string>>;
  mouse: Ref<{ x: number; y: number; inside: boolean }>;
  range: Ref<boolean>;
  aim: Ref<string>;
};

export function mountRenderer(canvas: HTMLCanvasElement, state: RenderState) {
  const { latest, previous, arrived, camera, marker, keys, mouse, range } =
    state;
  const teamColor = (team: string) => (team === "blue" ? "#79c9ef" : "#f08d82");
  const el = canvas;
  const ctx = el.getContext("2d")!;
  const fog = document.createElement("canvas");
  const fctx = fog.getContext("2d")!;
  const images = new Map<string, HTMLImageElement>();
  for (const c of characters) {
    const image = new Image();
    image.src = asset(`characters-mini/${c.id}_mini.png`);
    images.set(c.id, image);
  }
  const resize = new ResizeObserver(() => {
    const rect = el.getBoundingClientRect();
    camera.current.width = rect.width;
    camera.current.height = rect.height;
    el.width = Math.round(rect.width * devicePixelRatio);
    el.height = Math.round(rect.height * devicePixelRatio);
    fog.width = el.width;
    fog.height = el.height;
  });
  resize.observe(el);
  let frame = 0,
    last = 0;
  function draw(now: number) {
    const current = latest.current;
    const w = current.world;
    const me = w.actors.find((a) => a.id === current.selfId)!;
    const c = camera.current;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const alpha = Math.min(1, (now - arrived.current) / 100);
    const position = (a: Actor) =>
      interpolatePosition(
        previous.current?.actors.find((v) => v.id === a.id)?.position,
        a.position,
        alpha,
        w.map,
      );
    if (c.locked || c.space) {
      const p = project(position(me));
      c.x = p.x;
      c.y = p.y;
    } else {
      const m = mouse.current;
      let dx =
          (keys.current.has("ArrowRight") ? 1 : 0) -
          (keys.current.has("ArrowLeft") ? 1 : 0),
        dy =
          (keys.current.has("ArrowDown") ? 1 : 0) -
          (keys.current.has("ArrowUp") ? 1 : 0);
      if (m.inside) {
        if (m.x < 15) dx--;
        if (m.x > c.width - 15) dx++;
        if (m.y < 15) dy--;
        if (m.y > c.height - 15) dy++;
      }
      const len = Math.hypot(dx, dy);
      if (len) {
        c.x += (dx / len) * 1000 * dt;
        c.y += (dy / len) * 1000 * dt;
      }
      const p = unproject(c.x, c.y);
      p.s = Math.max(0, Math.min(w.map.length, p.s));
      p.t = Math.max(-700, Math.min(700, p.t));
      const screen = project(p);
      c.x = screen.x;
      c.y = screen.y;
    }
    const screen = (p: Point) => {
      const q = project(p);
      return {
        x: (q.x - c.x) * c.zoom + c.width / 2,
        y: (q.y - c.y) * c.zoom + c.height / 2,
      };
    };
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = "#161b1c";
    ctx.fillRect(0, 0, c.width, c.height);
    function polygon(points: Point[], fill: string, stroke?: string) {
      ctx.beginPath();
      points.forEach((p, i) => {
        const q = screen(p);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    function circle(p: Point, r: number, color: string, line?: string) {
      const q = screen(p);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r * c.zoom, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (line) {
        ctx.strokeStyle = line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Procedural stonework uses world coordinates, so camera/zoom never shift the terrain.
    polygon(
      [
        { s: 0, t: -700 },
        { s: 6000, t: -700 },
        { s: 6000, t: 700 },
        { s: 0, t: 700 },
      ],
      "#444a42",
      "#858773",
    );
    for (let s = 0; s < 6000; s += 100) {
      for (let t = -700; t < 700; t += 100) {
        const shade = ((((s / 100) * 13 + (t / 100) * 7) % 5) + 5) % 5;
        polygon(
          [
            { s: s + 2, t: t + 2 },
            { s: s + 98, t: t + 2 },
            { s: s + 98, t: t + 98 },
            { s: s + 2, t: t + 98 },
          ],
          ["#414940", "#454b42", "#484e43", "#3e473f", "#4a4f44"][shade],
        );
      }
    }
    polygon(
      [
        { s: 0, t: -125 },
        { s: 6000, t: -125 },
        { s: 6000, t: 125 },
        { s: 0, t: 125 },
      ],
      "#6e6e5435",
    );
    for (let s = 0; s <= 6000; s += 160) {
      for (const side of [-1, 1]) {
        polygon(
          [
            { s: s - 100, t: side * 705 },
            { s: s + 30, t: side * 980 },
            { s: s + 160, t: side * 705 },
          ],
          "#252e2b",
          "#485146",
        );
      }
    }
    for (const o of w.map.structures) {
      if (o.kind === "base")
        circle(o.position, 500, "#0000", `${teamColor(o.team)}55`);
    }
    for (const b of w.map.bushes) {
      polygon(
        [
          { s: b.minS, t: b.minT },
          { s: b.maxS, t: b.minT },
          { s: b.maxS, t: b.maxT },
          { s: b.minS, t: b.maxT },
        ],
        "#263d31",
        "#74936d",
      );
      for (let s = b.minS + 20; s < b.maxS; s += 100) {
        polygon(
          [
            { s, t: b.minT + 20 },
            { s: s + 50, t: b.minT + 20 },
            { s: s + 50, t: b.maxT - 20 },
            { s, t: b.maxT - 20 },
          ],
          "#545d4e",
          "#788271",
        );
      }
      const p = screen({
        s: (b.minS + b.maxS) / 2,
        t: (b.minT + b.maxT) / 2,
      });
      ctx.fillStyle = "#d3d8bd";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("廃墟", p.x, p.y);
    }
    for (const o of w.map.structures) {
      const q = screen(o.position);
      circle(o.position, o.radius, "#202a2c", teamColor(o.team));
      ctx.save();
      ctx.translate(q.x, q.y);
      const z = c.zoom;
      ctx.fillStyle = teamColor(o.team);
      ctx.shadowColor = teamColor(o.team);
      ctx.shadowBlur = 12;
      if (o.kind === "base") {
        ctx.beginPath();
        ctx.moveTo(0, -120 * z);
        ctx.lineTo(46 * z, -45 * z);
        ctx.lineTo(0, 0);
        ctx.lineTo(-46 * z, -45 * z);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#8d927e";
        ctx.fillRect(-30 * z, -110 * z, 60 * z, 95 * z);
        ctx.fillStyle = teamColor(o.team);
        ctx.fillRect(-35 * z, -117 * z, 70 * z, 20 * z);
      }
      ctx.restore();
      ctx.fillStyle = "#dee5d6";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        o.kind === "base"
          ? "本拠地"
          : o.id.endsWith("outer")
            ? "1st タワー"
            : "2nd タワー",
        q.x,
        q.y + o.radius * c.zoom + 18,
      );
    }
    // Fog is presentation only; the server independently removes hidden opponents.
    fctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    fctx.globalCompositeOperation = "source-over";
    fctx.clearRect(0, 0, c.width, c.height);
    fctx.fillStyle = "#050d12c9";
    fctx.fillRect(0, 0, c.width, c.height);
    fctx.globalCompositeOperation = "destination-out";
    const sources = w.map.structures
      .filter((o) => o.team === me.team)
      .map((o) => ({ p: o.position, r: o.kind === "base" ? 800 : 1000 }));
    if (me.hp > 0) sources.push({ p: position(me), r: 1200 });
    for (const source of sources) {
      const q = screen(source.p);
      const radius = source.r * c.zoom;
      const grad = fctx.createRadialGradient(
        q.x,
        q.y,
        radius * 0.88,
        q.x,
        q.y,
        radius,
      );
      grad.addColorStop(0, "#000");
      grad.addColorStop(1, "#0000");
      fctx.fillStyle = grad;
      fctx.beginPath();
      fctx.arc(q.x, q.y, radius, 0, Math.PI * 2);
      fctx.fill();
    }
    ctx.drawImage(fog, 0, 0, c.width, c.height);
    if (range.current && me.hp > 0)
      circle(position(me), me.stats.range, "#93ceef0b", "#9ccee877");
    for (const a of [...w.actors].sort(
      (a, b) => project(position(a)).y - project(position(b)).y,
    )) {
      if (a.hp <= 0) continue;
      const q = screen(position(a));
      const z = c.zoom;
      circle(
        position(a),
        w.map.characterRadius,
        a.id === me.id ? "#b7d67f30" : "#0004",
        a.id === me.id ? "#e0dfa0" : teamColor(a.team),
      );
      if (a.recallUntil > 0)
        circle(position(a), 55 + Math.sin(now / 180) * 8, "#0000", "#b3e4ff");
      if (a.attackUntil > w.time) {
        const facing = project(a.facing);
        const angle = Math.atan2(facing.y, facing.x);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 55 * z, angle - 0.8, angle + 0.8);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#f9dfa7";
        ctx.stroke();
      }
      const image = images.get(a.character);
      ctx.save();
      ctx.translate(q.x, q.y);
      if (project(a.facing).x < 0) ctx.scale(-1, 1);
      if (w.time - a.hitAt < 0.15 && a.hitAt > 0) ctx.filter = "brightness(2)";
      if (image?.complete && image.naturalWidth)
        ctx.drawImage(image, -75 * z, -148 * z, 150 * z, 155 * z);
      else {
        ctx.fillStyle = teamColor(a.team);
        ctx.fillRect(-20, -45, 40, 45);
      }
      ctx.restore();
      const width = 92;
      ctx.fillStyle = "#090e12";
      ctx.fillRect(q.x - width / 2, q.y - 158 * z, width, 8);
      ctx.fillStyle = a.id === me.id ? "#a7cb73" : teamColor(a.team);
      ctx.fillRect(
        q.x - width / 2 + 1,
        q.y - 158 * z + 1,
        (width - 2) * Math.max(0, a.hp / a.stats.hp),
        6,
      );
      ctx.fillStyle = "#f0ede2";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        a.name + (a.disconnected ? " [切断]" : ""),
        q.x,
        q.y - 158 * z - 7,
      );
    }
    function skillShape(
      e: Omit<SkillEffect, "id" | "owner" | "until">,
      preview: boolean,
    ) {
      const fill = preview
        ? "#86dfca24"
        : e.shape === "heal"
          ? "#93f1a866"
          : "#e6bc7966";
      const stroke = preview ? "#91ffe1" : "#ffe4ac";
      if (e.shape === "circle" || e.shape === "heal")
        circle(e.origin, e.radius || 65, fill, stroke);
      else if (e.shape === "cone") {
        const angle = Math.atan2(e.direction.t, e.direction.s),
          half = (e.angle * Math.PI) / 360;
        const points = [e.origin];
        for (let i = 0; i <= 24; i++) {
          const theta = angle - half + (2 * half * i) / 24;
          points.push({
            s: e.origin.s + Math.cos(theta) * e.range,
            t: e.origin.t + Math.sin(theta) * e.range,
          });
        }
        polygon(points, fill, stroke);
      } else {
        const end = {
          s: e.origin.s + e.direction.s * e.range,
          t: e.origin.t + e.direction.t * e.range,
        };
        const from = screen(e.origin),
          to = screen(end);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, e.width * c.zoom);
        ctx.strokeStyle = fill;
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }
    for (const e of w.effects || []) skillShape(e, false);
    const skill = me.skills?.find((s) => s.slot === state.aim.current);
    if (skill && me.hp > 0 && !me.cast) {
      const cursor = unproject(
        (mouse.current.x - c.width / 2) / c.zoom + c.x,
        (mouse.current.y - c.height / 2) / c.zoom + c.y,
      );
      const origin = me.position,
        ds = cursor.s - origin.s,
        dt = cursor.t - origin.t,
        d = Math.hypot(ds, dt);
      const direction = d > 1e-8 ? { s: ds / d, t: dt / d } : me.facing;
      const dest = {
        s: origin.s + direction.s * Math.min(d, skill.range),
        t: origin.t + direction.t * Math.min(d, skill.range),
      };
      let length = skill.range;
      if (skill.shape === "line") {
        for (const o of w.map.structures) {
          const x = origin.s - o.position.s,
            y = origin.t - o.position.t,
            r = o.radius + skill.width / 2,
            b = x * direction.s + y * direction.t,
            q = x * x + y * y - r * r,
            disc = b * b - q;
          if (q <= 0) length = 0;
          else if (disc >= 0) {
            const t = -b - Math.sqrt(disc);
            if (t >= 0) length = Math.min(length, t);
          }
        }
        if (direction.s > 0)
          length = Math.min(length, (w.map.length - origin.s) / direction.s);
        else if (direction.s < 0)
          length = Math.min(length, -origin.s / direction.s);
        if (direction.t > 0)
          length = Math.min(length, (w.map.width / 2 - origin.t) / direction.t);
        else if (direction.t < 0)
          length = Math.min(
            length,
            (-w.map.width / 2 - origin.t) / direction.t,
          );
      }
      if (skill.aim === "point" || skill.aim === "target")
        circle(origin, skill.range, "#0000", "#91ffe177");
      skillShape(
        {
          ...skill,
          origin: skill.aim === "point" ? dest : origin,
          direction,
          range: Math.max(0, length),
        },
        true,
      );
    }
    for (const p of w.projectiles) {
      circle(
        p.position,
        p.kind === "skill" ? p.width / 2 : 9,
        p.kind === "skill" ? "#a8ef9477" : "#f9dfa7",
        "#fff3c8",
      );
    }
    if (marker.current && now - marker.current.at < 1100) {
      circle(
        marker.current.point,
        18 + (now - marker.current.at) / 35,
        "#0000",
        "#d1daa5",
      );
    }
    ctx.fillStyle = "#ebe8d1";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(c.locked ? "追従カメラ" : "自由カメラ", 16, 26);
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
  };
}
