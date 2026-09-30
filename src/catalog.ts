export const characters = [
  {
    id: "Sophie",
    name: "ソフィー",
    role: "マークスマン",
    hp: 600,
    mana: 330,
    speed: 350,
    range: 500,
    description: "遠くから狙いを定め、戦場に勝利の種をまく。",
    skills: ["growth ～成長～", "bloom ～開花～", "fruit ～結実～"],
  },
  {
    id: "Jude",
    name: "ジュード",
    role: "タンク",
    hp: 850,
    mana: 280,
    speed: 350,
    range: 150,
    description: "攻撃を受け止め、粘り強く前線を支える。",
    skills: ["急襲", "切り裂き", "応急手当"],
  },
  {
    id: "Nadia",
    name: "ナディア",
    role: "アサシン",
    hp: 650,
    mana: 300,
    speed: 450,
    range: 200,
    description: "素早く間合いを詰め、毒と連撃で仕留める。",
    skills: ["対包囲戦術", "前方範囲殲滅", "前方殲滅・改"],
  },
  {
    id: "Chiyo",
    name: "望月 千代",
    role: "ファイター",
    hp: 750,
    mana: 280,
    speed: 350,
    range: 200,
    description: "体勢を整え、一閃で道を切り開く。",
    skills: ["一文字斬り", "袈裟斬り", "真向斬り"],
  },
] as const;
export const spells = [
  {
    id: "flash",
    name: "フラッシュ",
    symbol: "↯",
    cd: 120,
    description: "カーソル方向へ最大400U瞬間移動。",
  },
  {
    id: "ignite",
    name: "イグナイト",
    symbol: "♨",
    cd: 70,
    description: "敵1体に5秒間で50の確定ダメージ。射程600U。",
  },
  {
    id: "barrier",
    name: "バリア",
    symbol: "◇",
    cd: 90,
    description: "自身に耐久力100のシールドを5秒間付与。",
  },
] as const;
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export function validName(value: string) {
  const name = value.trim();
  return (
    [...name].length >= 1 && [...name].length <= 16 && !/\p{Cc}/u.test(name)
  );
}
