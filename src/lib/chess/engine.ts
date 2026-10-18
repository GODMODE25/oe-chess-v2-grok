import { assetUrl } from "./asset-url";
import { logDiag } from "./diag";
import type { EngineInfo } from "./types";
import { parseBestmove, parseInfo } from "./uci";

type Waiter = { resolve: (line: string) => void; reject: (error: Error) => void; onInfo?: (info: EngineInfo) => void };

const ENGINE_JS = "/engines/stockfish-19-lite-single.js";

export class EngineClient {
  private worker: Worker | null = null;
  private waiter: Waiter | null = null;
  private uciok: (() => void) | null = null;
  private readyok: (() => void) | null = null;
  private failed: Error | null = null;
  readonly ready: Promise<void>;
  private strengthKey = "";

  constructor() {
    this.ready = this.boot();
  }

  private boot(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(assetUrl(ENGINE_JS));
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Could not start Stockfish");
        this.failed = err;
        logDiag("error", err.message);
        reject(err);
        return;
      }
      this.worker.onmessage = (event) => this.onMessage(event.data);
      this.worker.onerror = () => {
        const err = new Error("Stockfish failed to load. The engine file may be blocked.");
        this.failed = err;
        logDiag("error", err.message);
        reject(err);
      };
      const timer = setTimeout(() => {
        const err = new Error("Stockfish did not answer. Reload and try again.");
        this.failed = err;
        logDiag("error", err.message);
        reject(err);
      }, 12000);
      void this.waitFor("uciok", () => this.send("uci"))
        .then(async () => {
          this.send("setoption name Hash value 32");
          this.send("ucinewgame");
          await this.waitFor("readyok", () => this.send("isready"));
          clearTimeout(timer);
          logDiag("info", "Stockfish 19 lite is ready");
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("Stockfish boot failed"));
        });
    });
  }

  private onMessage(data: unknown) {
    const text = typeof data === "string" ? data : data && typeof data === "object" && "data" in data ? String((data as { data: unknown }).data) : "";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line === "uciok") this.uciok?.();
      if (line === "readyok") this.readyok?.();
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

  private waitFor(token: "uciok" | "readyok", fire: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${token}`)), 10000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      if (token === "uciok") this.uciok = done;
      else this.readyok = done;
      fire();
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
    await this.waitFor("readyok", () => this.send("isready"));
  }

  async go(options: {
    fen: string;
    uciMoves?: string[];
    movetime?: number;
    depth?: number;
    strength: number | "max";
    onInfo?: (info: EngineInfo) => void;
  }): Promise<string | null> {
    await this.ready;
    if (this.failed) throw this.failed;
    await this.setStrength(options.strength);
    if (this.waiter) {
      this.send("stop");
      try {
        await Promise.race([
          new Promise((resolve) => {
            const prev = this.waiter;
            if (!prev) return resolve(null);
            const orig = prev.resolve;
            prev.resolve = (line) => {
              orig(line);
              resolve(line);
            };
          }),
          new Promise((resolve) => setTimeout(resolve, 400)),
        ]);
      } catch {
        /* the stopped search can resolve late */
      }
      this.waiter = null;
    }
    const moves = options.uciMoves?.length ? ` moves ${options.uciMoves.join(" ")}` : "";
    this.send(`position fen ${options.fen}${moves}`);
    const line = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error("Stockfish search timed out"));
      }, Math.max(8000, (options.movetime ?? 2000) + 6000));
      this.waiter = {
        onInfo: options.onInfo,
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
    return parseBestmove(line)?.move ?? null;
  }

  stop() {
    if (this.waiter) this.send("stop");
  }

  destroy() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }
}

let singleton: EngineClient | null = null;

export function getEngine(): EngineClient {
  if (!singleton) singleton = new EngineClient();
  return singleton;
}
