import { useEffect, useRef, useState } from "react";
import { asset, characters, spells, validName } from "./catalog";
import { useLobby } from "./useLobby";
import "./App.css";
import { GameScene } from "./GameScene";

function stored(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private storage may be unavailable. */
  }
}
function volume(key: string) {
  const n = Number(stored(key, "50"));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

export default function App() {
  const lobby = useLobby();
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState(() => stored("moba.name", ""));
  const [character, setCharacter] = useState("Sophie");
  const [chosenSpells, setChosenSpells] = useState(["flash", "ignite"]);
  const [picker, setPicker] = useState(false);
  const [bgm, setBgm] = useState(() => volume("moba.bgm"));
  const [se, setSe] = useState(() => volume("moba.se"));
  const [now, setNow] = useState(Date.now());
  const music = useRef<HTMLAudioElement | null>(null);
  const readySent = useRef("");
  const dialog = useRef<HTMLDialogElement>(null);
  const state = lobby.state;
  const match = state?.match;
  const phase = state?.phase ?? "entrance";
  const locked = phase !== "entrance" || lobby.busy;
  const selected = characters.find((c) => c.id === character) ?? characters[0];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    save("moba.name", name);
  }, [name]);
  useEffect(() => {
    save("moba.bgm", String(bgm));
    if (music.current) music.current.volume = bgm / 100;
  }, [bgm]);
  useEffect(() => {
    save("moba.se", String(se));
  }, [se]);
  useEffect(() => {
    const audio = new Audio(asset("sound/menu.mp3"));
    audio.loop = true;
    music.current = audio;
    return () => {
      audio.pause();
      music.current = null;
    };
  }, []);
  useEffect(() => {
    if (state?.selection.character) {
      setName(state.selection.name);
      setCharacter(state.selection.character);
      setChosenSpells(state.selection.spells);
    }
    if (state && state.phase !== "entrance") {
      setEntered(true);
      setPicker(false);
    }
  }, [state]);
  useEffect(() => {
    if (picker) dialog.current?.showModal();
    else dialog.current?.close();
  }, [picker]);
  useEffect(() => {
    if (!match || match.phase !== "loading" || !lobby.connected) {
      readySent.current = "";
      return;
    }
    if (
      readySent.current === match.id ||
      match.players.find((p) => p.id === state?.selfId)?.ready
    )
      return;
    let disposed = false;
    // Readiness acknowledges actual loading of the portraits used in this stage.
    Promise.all(
      match.players.map(
        (p) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = reject;
            image.src = asset(`characters-mini/${p.character}_mini.png`);
          }),
      ),
    )
      .then(() => {
        if (!disposed) {
          readySent.current = match.id;
          lobby.send({ type: "ready", matchId: match.id });
        }
      })
      .catch(() => {
        /* The server's 30-second deadline invalidates failed loads. */
      });
    return () => {
      disposed = true;
    };
    // Only restart asset loading for a new match/phase/connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.phase, lobby.connected, state?.selfId]);

  function sound() {
    const audio = new Audio(asset("sound/click.mp3"));
    audio.volume = se / 100;
    void audio.play().catch(() => {});
  }
  function enter() {
    if (!validName(name)) return;
    setName(name.trim());
    setEntered(true);
    sound();
    if (music.current) {
      music.current.volume = bgm / 100;
      void music.current.play().catch(() => {});
    }
  }
  function chooseSpell(slot: number, id: string) {
    const next = [...chosenSpells];
    const other = 1 - slot;
    if (next[other] === id) next[other] = next[slot];
    next[slot] = id;
    setChosenSpells(next);
    sound();
  }
  function back() {
    if (!match) return;
    if (
      window.confirm(
        "このマッチを終了してエントランスへ戻りますか？ 相手のマッチも終了します。",
      )
    )
      lobby.send({ type: "leave", matchId: match.id });
  }
  return (
    <main className="app">
      <header className="header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!locked) setEntered(true);
          }}
        >
          LEAGUE <small>of</small> AUXILIA
        </a>
        <div className="header-tools">
          <span className={`connection ${lobby.connected ? "online" : ""}`}>
            {lobby.connected ? `Active: ${lobby.active ?? "—"}人` : "接続中…"}
          </span>
          {entered && (
            <button
              disabled={!lobby.connected || lobby.busy || phase === "queued"}
              onClick={() => (match ? back() : setEntered(true))}
            >
              エントランス
            </button>
          )}
          <details className="audio">
            <summary aria-label="音量設定">音量 ♫</summary>
            <div className="audio-panel">
              <label>
                BGM <output>{bgm}%</output>
                <input
                  aria-label="BGM音量"
                  type="range"
                  min="0"
                  max="100"
                  value={bgm}
                  onChange={(e) => setBgm(Number(e.target.value))}
                />
              </label>
              <label>
                SE <output>{se}%</output>
                <input
                  aria-label="SE音量"
                  type="range"
                  min="0"
                  max="100"
                  value={se}
                  onChange={(e) => setSe(Number(e.target.value))}
                />
              </label>
            </div>
          </details>
        </div>
      </header>
      {lobby.error && (
        <div className="notice" role="alert">
          {lobby.error}
          <button onClick={lobby.clearError} aria-label="通知を閉じる">
            ×
          </button>
        </div>
      )}
      {!entered ? (
        <section className="home">
          <div>
            <p className="eyebrow">AUXILIA / ONE ON ONE</p>
            <h1>
              League
              <br />
              <em>of Auxilia</em>
            </h1>
            <p className="muted">一人の決断が、戦場を変える。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enter();
              }}
            >
              <label htmlFor="player-name">プレイヤー名</label>
              <input
                id="player-name"
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名前を入力"
                aria-describedby="name-help"
              />
              <small id="name-help">
                1〜16文字・改行不可。同じ名前も使用できます。
              </small>
              <button className="primary" disabled={!validName(name)}>
                エントランスへ →
              </button>
            </form>
          </div>
          <div className="home-duel" aria-hidden="true">
            <img src={asset("characters-mini/Sophie_mini.png")} />
            <span>VS</span>
            <img
              className="flip"
              src={asset("characters-mini/Nadia_mini.png")}
            />
          </div>
        </section>
      ) : match && phase === "playing" ? (
        lobby.world && lobby.world.matchId === match.id ? (
          <GameScene
            world={lobby.world}
            selfId={state!.selfId}
            spells={match.players.find((p) => p.id === state!.selfId)!.spells}
            connected={lobby.connected}
            input={lobby.input}
          />
        ) : (
          <p role="status">戦場を準備しています…</p>
        )
      ) : match ? (
        <section className="match-screen">
          <p className="eyebrow">MATCH FOUND / 1 VS 1</p>
          <h1>{phase === "countdown" ? "まもなく開始" : "マッチング成立"}</h1>
          <div className="versus">
            {match.players.map((p) => {
              const c = characters.find((v) => v.id === p.character)!;
              return (
                <article className={`fighter ${p.team}`} key={p.id}>
                  <div className="fighter-top">
                    {p.team.toUpperCase()}{" "}
                    <span>{p.id === state?.selfId ? "YOU" : "OPPONENT"}</span>
                  </div>
                  <img
                    src={asset(`characters/${p.character}.png`)}
                    alt={c.name}
                  />
                  <h2>{p.name}</h2>
                  <p>
                    {c.name} <span className="muted">/ {c.role}</span>
                  </p>
                  <div className="match-spells">
                    {p.spells.map((id, i) => (
                      <span key={id}>
                        <kbd>{i === 0 ? "D" : "F"}</kbd>{" "}
                        {spells.find((s) => s.id === id)?.name}
                      </span>
                    ))}
                  </div>
                  <p className="load-status">
                    {p.ready ? "✓ ロード完了" : "素材をロード中…"}
                  </p>
                </article>
              );
            })}
            <span className="vs">VS</span>
          </div>
          <div className="match-status" role="status">
            {phase === "countdown"
              ? `開始まで ${Math.max(0, Math.ceil((match.deadline - now) / 1000))} 秒`
              : `両プレイヤーのロードを待っています（残り ${Math.max(0, Math.ceil((match.deadline - now) / 1000))} 秒）`}
          </div>
          <button disabled={!lobby.connected || lobby.busy} onClick={back}>
            エントランスへ戻る
          </button>
        </section>
      ) : (
        <section className="entrance">
          <div className="section-title">
            <div>
              <p className="eyebrow">ENTRANCE / 1 VS 1</p>
              <h1>戦場へ向かう準備を。</h1>
            </div>
            <label className="name-edit">
              プレイヤー名
              <input
                aria-label="プレイヤー名"
                disabled={locked}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <div className="setup">
            <section className="character-panel">
              <p className="eyebrow">01 / CHARACTER</p>
              <button
                className="portrait-button"
                disabled={locked}
                onClick={() => {
                  setPicker(true);
                  sound();
                }}
                aria-label="キャラクターを選択"
              >
                <img
                  src={asset(`characters/${selected.id}.png`)}
                  alt={selected.name}
                />
                <span className="portrait-caption">
                  <small>{selected.role}</small>
                  <strong>{selected.name}</strong>
                  <span>クリックしてキャラクターを変更 ↗</span>
                </span>
              </button>
              <div className="character-strip">
                {characters.map((c) => (
                  <button
                    disabled={locked}
                    aria-pressed={c.id === character}
                    aria-label={c.name}
                    key={c.id}
                    onClick={() => {
                      setCharacter(c.id);
                      sound();
                    }}
                  >
                    <img
                      src={asset(`characters-mini/${c.id}_mini.png`)}
                      alt=""
                    />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="loadout">
              <p className="eyebrow">02 / SUMMONER SPELLS</p>
              <h2>サモナースペルを選択</h2>
              <p className="muted">
                異なる2つを装備。同じスペルを選ぶと配置を入れ替えます。
              </p>
              {chosenSpells.map((id, slot) => (
                <fieldset disabled={locked} key={slot}>
                  <legend>
                    <kbd>{slot === 0 ? "D" : "F"}</kbd>{" "}
                    {spells.find((s) => s.id === id)?.name}
                  </legend>
                  <div className="spell-options">
                    {spells.map((s) => (
                      <button
                        key={s.id}
                        aria-pressed={s.id === id}
                        onClick={() => chooseSpell(slot, s.id)}
                        title={s.description}
                      >
                        <b>{s.symbol}</b>
                        <span>{s.name}</span>
                        <small>CD {s.cd}s</small>
                      </button>
                    ))}
                  </div>
                  <p className="spell-description">
                    {spells.find((s) => s.id === id)?.description}
                  </p>
                </fieldset>
              ))}
              <div className="mode-info">
                <span>SINGLE LANE</span>
                <strong>1 対 1</strong>
                <p>単一レーン / 目標試合時間 10分</p>
              </div>
            </section>
          </div>
          <footer className="queue-bar">
            <div role="status">
              <strong>
                {phase === "queued"
                  ? "対戦相手を探しています…"
                  : `${selected.name} で出撃`}
              </strong>
              <p>
                {phase === "queued"
                  ? "待機中は編成を変更できません。"
                  : "キャラクターとスペルを確認して、マッチングを開始。"}
              </p>
            </div>
            {phase === "queued" ? (
              <button
                disabled={lobby.busy || !lobby.connected}
                onClick={() => lobby.send({ type: "cancel" })}
              >
                待機をキャンセル
              </button>
            ) : (
              <button
                className="primary"
                disabled={locked || !lobby.connected || !validName(name)}
                onClick={() => {
                  sound();
                  lobby.send({
                    type: "queue",
                    name: name.trim(),
                    character,
                    spells: chosenSpells,
                  });
                }}
              >
                {lobby.busy ? "送信中…" : "マッチング開始 →"}
              </button>
            )}
          </footer>
        </section>
      )}
      <dialog
        ref={dialog}
        className="character-dialog"
        onCancel={() => setPicker(false)}
      >
        <header>
          <div>
            <p className="eyebrow">CHARACTER SELECT</p>
            <h2>キャラクターを選択</h2>
          </div>
          <button
            onClick={() => setPicker(false)}
            aria-label="キャラクター選択を閉じる"
          >
            ×
          </button>
        </header>
        <div className="picker-grid">
          {characters.map((c) => (
            <button
              disabled={locked}
              key={c.id}
              aria-pressed={character === c.id}
              onClick={() => {
                setCharacter(c.id);
                setPicker(false);
                sound();
              }}
            >
              <img src={asset(`characters/${c.id}.png`)} alt="" />
              <h3>{c.name}</h3>
              <small>{c.role}</small>
              <p>{c.description}</p>
              <dl>
                <div>
                  <dt>HP</dt>
                  <dd>{c.hp}</dd>
                </div>
                <div>
                  <dt>マナ</dt>
                  <dd>{c.mana}</dd>
                </div>
                <div>
                  <dt>移動</dt>
                  <dd>{c.speed}</dd>
                </div>
                <div>
                  <dt>射程</dt>
                  <dd>{c.range}</dd>
                </div>
              </dl>
              <ul>
                {c.skills.map((skill, i) => (
                  <li key={skill}>
                    <kbd>{"QWE"[i]}</kbd> {skill}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </dialog>
    </main>
  );
}
