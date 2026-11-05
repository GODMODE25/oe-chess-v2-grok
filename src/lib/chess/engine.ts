import { Chess, type Square } from "chess.js";
import { assetUrl } from "./asset-url";
import { beginEngineBoot, markEngineFailed, markEngineHandshake, markEngineReady, reportEngineBytes } from "./engine-boot";
import { logDiag } from "./diag";
import type { EngineInfo } from "./types";
import { parseBestmove, parseInfo } from "./uci";

type Waiter = {
  id: number;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  onInfo?: (info: EngineInfo) => void;
};

const ENGINE_JS = "/engines/stockfish-19-lite-single.js";

let singleton: EngineClient | null = null;

function opponentInCheck(fen: string) {
  try {
    const chess = new Chess(fen);
    const turn = chess.turn();
    const other = turn === "w" ? "b" : "w";
    let king: Square | null = null;
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece?.type === "k" && piece.color === other) king = piece.square;
      }
    }
    if (!king) return true;
    return chess.isAttacked(king, turn);
  } catch {
    return true;
  }
}

export class EngineClient {
  private worker: Worker | null = null;
  private progressPort: MessagePort | null = null;
  private waiter: Waiter | null = null;
  private uciok: (() => void) | null = null;
  private readyok: (() => void) | null = null;
  private failed: Error | null = null;
  readonly ready: Promise<void>;
  private strengthKey = "";
  private seq = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor() {
    this.ready = this.boot();
  }

  private boot(): Promise<void> {
    return new Promise((resolve, reject) => {
      beginEngineBoot();
      try {
        this.worker = new Worker(assetUrl(ENGINE_JS));
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Could not start Stockfish");
        this.fail(err);
        reject(err);
        return;
      }
      this.attachProgressPort();
      this.worker.onmessage = (event) => this.onMessage(event.data);
      this.worker.onerror = (e) => {
        const err = new Error(e.message || "Stockfish stopped. It will load again for the next move.");
        this.fail(err);
        reject(err);
      };
      const timer = setTimeout(() => {
        const err = new Error("Stockfish did not answer. Reload and try again.");
        this.fail(err);
        reject(err);
      }, 60000);
      void this.waitFor("uciok", () => this.send("uci"), 45000)
        .then(async () => {
          this.send("setoption name Hash value 32");
          this.send("ucinewgame");
          await this.waitFor("readyok", () => this.send("isready"), 30000);
          clearTimeout(timer);
          this.closeProgressPort();
          markEngineReady();
          logDiag("info", "Stockfish 19 lite is ready");
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          const err = error instanceof Error ? error : new Error("Stockfish boot failed");
          this.fail(err);
          reject(err);
        });
    });
  }

  /**
   * The vendored worker streams wasm byte progress on a port it is handed, and
   * the `setoption name CanOutputEngineDownloadProgress` line only makes it
   * acknowledge that it will. Absence of events is a normal state (cached
   * response, or a download that finished before the port attached), so the
   * consumer treats silence as "unknown", never as failure.
   */
  private attachProgressPort() {
    if (!this.worker || typeof MessageChannel !== "function") return;
    try {
      const channel = new MessageChannel();
      channel.port2.onmessage = (event) => reportEngineBytes(event.data);
      this.worker.postMessage({ progressPort: channel.port1 }, [channel.port1]);
      this.progressPort = channel.port2;
      this.send("setoption name CanOutputEngineDownloadProgress");
    } catch {
      this.progressPort = null;
    }
  }

  private closeProgressPort() {
    const port = this.progressPort;
    this.progressPort = null;
    if (!port) return;
    port.onmessage = null;
    port.close();
  }

  private onMessage(data: unknown) {
    const text = typeof data === "string" ? data : data && typeof data === "object" && "data" in data ? String((data as { data: unknown }).data) : "";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line === "uciok") {
        markEngineHandshake();
        this.uciok?.();
      }
      if (line === "readyok") this.readyok?.();
      if (line.includes("CRITICAL ERROR")) {
        this.fail(new Error("Stockfish rejected that position."));
        this.worker?.terminate();
        this.worker = null;
        continue;
      }
      if (line.startsWith("info ") && this.waiter?.onInfo) {
        const info = parseInfo(line);
        if (info && info.depth > 0) this.waiter.onInfo(info);
      }
      if (line.startsWith("bestmove ") && this.waiter) {
        const waiter = this.waiter;
        this.waiter = null;
        waiter.resolve(line);
      }
    }
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  private waitFor(token: "uciok" | "readyok", fire: () => void, timeoutMs = 45000): Promise<void> {
    return new Promise((resolve, reject) => {
      let retryTimer: ReturnType<typeof setInterval> | null = null;
      const timer = setTimeout(() => {
        if (retryTimer) clearInterval(retryTimer);
        if (token === "uciok") this.uciok = null;
        else this.readyok = null;
        reject(new Error(`Timed out waiting for ${token}`));
      }, timeoutMs);

      const done = () => {
        clearTimeout(timer);
        if (retryTimer) clearInterval(retryTimer);
        if (token === "uciok") this.uciok = null;
        else this.readyok = null;
        resolve();
      };

      if (token === "uciok") this.uciok = done;
      else this.readyok = done;

      fire();

      // For uciok during initial startup, retry sending "uci" every 1.5s
      // until received or timeout, in case the worker was still loading.
      if (token === "uciok") {
        retryTimer = setInterval(() => {
          if (this.uciok) {
            fire();
          } else if (retryTimer) {
            clearInterval(retryTimer);
          }
        }, 1500);
      }
    });
  }

  async setStrength(strength: number | "max") {
    await this.ready;
    const key = String(strength);
    if (key === this.strengthKey) return;
    this.strengthKey = key;
    if (strength === "max") {
      this.send("setoption name UCI_LimitStrength value false");
      this.send("setoption name Skill Level value 20");
    } else {
      const elo = Math.max(1320, Math.min(3190, Math.round(strength)));
      this.send("setoption name UCI_LimitStrength value true");
      this.send("setoption name UCI_Elo value " + elo);
    }
    await this.waitFor("readyok", () => this.send("isready"), 30000);
  }

  async go(options: {
    fen: string;
    uciMoves?: string[];
    movetime?: number;
    depth?: number;
    strength: number | "max";
    onInfo?: (info: EngineInfo) => void;
  }): Promise<string | null> {
    const id = ++this.seq;
    if (this.waiter) this.send("stop");
    const run = this.tail.then(() => this.search(id, options));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async search(
    id: number,
    options: {
      fen: string;
      uciMoves?: string[];
      movetime?: number;
      depth?: number;
      strength: number | "max";
      onInfo?: (info: EngineInfo) => void;
    },
  ): Promise<string | null> {
    await this.ready;
    if (this.failed) throw this.failed;
    if (opponentInCheck(options.fen)) return null;
    if (id !== this.seq) return null;
    if (this.waiter) {
      this.send("stop");
      await this.waitBest(800);
      this.waiter = null;
    }
    if (id !== this.seq) return null;
    await this.setStrength(options.strength);
    if (id !== this.seq) return null;
    const moves = options.uciMoves?.length ? ` moves ${options.uciMoves.join(" ")}` : "";
    this.send(`position fen ${options.fen}${moves}`);
    const line = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiter?.id === id) this.waiter = null;
        reject(new Error("Stockfish search timed out"));
      }, Math.max(8000, (options.movetime ?? 2000) + 6000));
      this.waiter = {
        id,
        onInfo: (info) => {
          if (id === this.seq) options.onInfo?.(info);
        },
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const go: string[] = ["go"];
      if (options.depth) go.push("depth", String(options.depth));
      if (options.movetime) go.push("movetime", String(options.movetime));
      this.send(go.join(" "));
    });
    if (id !== this.seq) return null;
    const move = parseBestmove(line)?.move ?? null;
    if (!move || move === "0000" || move === "(none)") return null;
    return move;
  }

  private waitBest(ms: number) {
    return new Promise<void>((resolve) => {
      const waiter = this.waiter;
      if (!waiter) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      const orig = waiter.resolve;
      waiter.resolve = (line) => {
        clearTimeout(timer);
        orig(line);
        resolve();
      };
    });
  }

  isFailed() {
    return this.failed != null;
  }

  private fail(err: Error) {
    this.failed = err;
    this.closeProgressPort();
    markEngineFailed(err.message);
    logDiag("error", err.message);
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(err);
    if (singleton === this) singleton = null;
  }

  stop() {
    this.seq += 1;
    if (this.waiter) this.send("stop");
  }

  destroy() {
    this.stop();
    this.closeProgressPort();
    this.worker?.terminate();
    this.worker = null;
  }
}

export function getEngine(): EngineClient {
  if (!singleton || singleton.isFailed()) {
    singleton?.destroy();
    singleton = new EngineClient();
  }
  return singleton;
}
