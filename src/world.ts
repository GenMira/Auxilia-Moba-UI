export type Point = { s: number; t: number };
export type Skill = {
  upgradeReason: string;
  blinkDistance: number;
  hitRange: number;
  slot: string;
  name: string;
  aim: "self" | "direction" | "point" | "target";
  shape: string;
  range: number;
  radius: number;
  width: number;
  angle: number;
  mana: number;
  cooldown: number;
  duration: number;
  description: string;
  rank: number;
  amount: number;
  readyAt: number;
  reason: string;
};
export type SkillEffect = {
  id: number;
  owner: string;
  shape: string;
  origin: Point;
  direction: Point;
  range: number;
  radius: number;
  width: number;
  angle: number;
  until: number;
};
export type Structure = {
  id: string;
  team: string;
  kind: string;
  position: Point;
  radius: number;
  hp: number;
};
export type Arena = {
  length: number;
  width: number;
  characterRadius: number;
  grid: number;
  structures: Structure[];
  bushes: { minS: number; maxS: number; minT: number; maxT: number }[];
};
export type Actor = {
  spells?: Skill[];
  skillPoints: number;
  attackCount: number;
  skills?: Skill[];
  moveSpeed: number;
  statuses: {
    id: string;
    source: string;
    kind: string;
    until: number;
    value: number;
  }[];
  cast: {
    slot: string;
    shape: string;
    origin: Point;
    direction: Point;
    destination: Point;
    endsAt: number;
  } | null;
  id: string;
  team: string;
  character: string;
  name: string;
  position: Point;
  facing: Point;
  stats: {
    hp: number;
    mana: number;
    speed: number;
    attack: number;
    range: number;
    attackSpeed: number;
  };
  hp: number;
  mana: number;
  level: number;
  gold: number;
  moving: boolean;
  recallUntil: number;
  disconnected: boolean;
  kills: number;
  deaths: number;
  xp: number;
  respawnAt: number;
  hitAt: number;
  attackTarget: string;
  attackUntil: number;
};
export type World = {
  type: "world";
  matchId: string;
  time: number;
  ack: number;
  actors: Actor[];
  map: Arena;
  effects: SkillEffect[];
  projectiles: {
    id: number;
    owner: string;
    target: string;
    position: Point;
    kind: string;
    width: number;
  }[];
};
export const project = (p: Point) => ({
  x: (p.s + p.t) / Math.SQRT2,
  y: (-p.s + p.t) / Math.SQRT2,
});

// Preview the same landing-only correction used by the server.
export function blinkLanding(start: Point, end: Point, map: Arena): Point {
  const d = Math.hypot(end.s - start.s, end.t - start.t);
  if (d < 1e-8) return start;
  const dir = { s: (end.s - start.s) / d, t: (end.t - start.t) / d };
  let limit = d;
  if (dir.s > 0)
    limit = Math.min(
      limit,
      (map.length - map.characterRadius - start.s) / dir.s,
    );
  else if (dir.s < 0)
    limit = Math.min(limit, (map.characterRadius - start.s) / dir.s);
  if (dir.t > 0)
    limit = Math.min(
      limit,
      (map.width / 2 - map.characterRadius - start.t) / dir.t,
    );
  else if (dir.t < 0)
    limit = Math.min(
      limit,
      (-map.width / 2 + map.characterRadius - start.t) / dir.t,
    );
  for (let i = 0; i <= map.structures.length; i++) {
    const p = {
      s: start.s + dir.s * Math.max(0, limit),
      t: start.t + dir.t * Math.max(0, limit),
    };
    const blocked = map.structures.filter(
      (o) =>
        Math.hypot(p.s - o.position.s, p.t - o.position.t) <
        o.radius + map.characterRadius + 0.01,
    );
    if (!blocked.length) return p;
    for (const o of blocked) {
      const x = start.s - o.position.s,
        y = start.t - o.position.t,
        r = o.radius + map.characterRadius + 0.010001,
        b = x * dir.s + y * dir.t,
        disc = b * b - (x * x + y * y - r * r);
      if (disc >= 0)
        limit = Math.max(0, Math.min(limit, -b - Math.sqrt(disc) - 0.000001));
    }
  }
  return start;
}
export const unproject = (x: number, y: number): Point => ({
  s: (x - y) / Math.SQRT2,
  t: (x + y) / Math.SQRT2,
});
export const mini = (p: Point) => {
  const q = project(p);
  return {
    x: ((q.x + 700 / Math.SQRT2) / (7400 / Math.SQRT2)) * 180,
    y: ((q.y + 6700 / Math.SQRT2) / (7400 / Math.SQRT2)) * 180,
  };
};

// A straight interpolation across a navigation corner must not cut a building.
export function interpolatePosition(
  old: Point | undefined,
  next: Point,
  alpha: number,
  map: Arena,
): Point {
  if (!old || Math.hypot(next.s - old.s, next.t - old.t) > 100) return next;
  const dx = next.s - old.s,
    dy = next.t - old.t,
    length = dx * dx + dy * dy;
  for (const o of map.structures) {
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((o.position.s - old.s) * dx + (o.position.t - old.t) * dy) /
              length,
          ),
        )
      : 0;
    if (
      Math.hypot(old.s + t * dx - o.position.s, old.t + t * dy - o.position.t) <
      o.radius + map.characterRadius
    )
      return next;
  }
  return { s: old.s + dx * alpha, t: old.t + dy * alpha };
}
