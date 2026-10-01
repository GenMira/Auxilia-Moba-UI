import { useEffect, useRef, useState } from "react";
import type { World } from "./world";

export type Selection = { name: string; character: string; spells: string[] };
export type Player = Selection & {
  id: string;
  team: "blue" | "red";
  ready: boolean;
};
export type Match = {
  id: string;
  phase: string;
  players: Player[];
  deadline: number;
};
type State = {
  type: "state";
  selfId: string;
  phase: string;
  selection: Selection;
  match: Match | null;
  notice: string;
};

// StrictMode and multiple components share the initial cookie bootstrap request.
let bootstrap: Promise<Response> | undefined;
function session() {
  if (!bootstrap)
    bootstrap = fetch("/api/session", {
      method: "POST",
      credentials: "same-origin",
    }).finally(() => {
      bootstrap = undefined;
    });
  return bootstrap;
}
export function useLobby() {
  const socket = useRef<WebSocket | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const sequence = useRef(0);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function connect() {
      try {
        const response = await session();
        if (!response.ok) throw new Error("セッションを作成できませんでした。");
        if (disposed) return;
        ws = new WebSocket(
          `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
        );
        socket.current = ws;
        ws.onmessage = (event) => {
          if (disposed) return;
          const message = JSON.parse(event.data);
          if (message.type === "state") {
            if (message.phase !== "playing") {
              setWorld(null);
              sequence.current = 0;
            }
            setState(message);
            setConnected(true);
            setBusy(false);
            clearTimeout(pending.current);
            if (message.notice) setError(message.notice);
          } else if (message.type === "world") {
            setWorld(message);
            sequence.current = Math.max(sequence.current, message.ack);
          } else if (message.type === "presence") setActive(message.active);
          else if (message.type === "error") {
            setError(message.message);
            setBusy(false);
            clearTimeout(pending.current);
          }
        };
        ws.onclose = () => {
          if (disposed) return;
          setConnected(false);
          setActive(null);
          setBusy(false);
          clearTimeout(pending.current);
          setError(
            "接続が切れました。再接続しています。待機は自動再開しません。",
          );
          retry = setTimeout(() => setAttempt((v) => v + 1), 2000);
        };
      } catch {
        if (!disposed) {
          setError("サーバーに接続できません。起動状態を確認してください。");
          retry = setTimeout(() => setAttempt((v) => v + 1), 3000);
        }
      }
    }
    void connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(pending.current);
      ws?.close();
      socket.current = null;
    };
  }, [attempt]);
  function send(command: object) {
    if (!connected || socket.current?.readyState !== WebSocket.OPEN) {
      setError("サーバーに接続してから操作してください。");
      return;
    }
    setError("");
    setBusy(true);
    socket.current.send(JSON.stringify(command));
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      setBusy(false);
      setError("応答を確認できませんでした。再接続します。");
      socket.current?.close();
    }, 8000);
  }
  return {
    world,
    input: (command: object) => {
      if (connected && socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(
          JSON.stringify({ ...command, sequence: ++sequence.current }),
        );
    },
    state,
    connected,
    active,
    error,
    busy,
    send,
    clearError: () => setError(""),
  };
}
