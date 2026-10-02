export type Point = { s: number; t: number };
export type Skill = {
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
