"use client";

import { load, type Type } from "protobufjs";

export type UpstoxLiveTick = {
  instrumentKey: string;
  price: number;
  timestampMs: number;
};

type LiveFeedOptions = {
  instrumentKey?: string;
  instrumentKeys?: string[];
  signal: AbortSignal;
  onTick: (tick: UpstoxLiveTick) => void;
  onDisconnect: () => void;
};

type FeedObject = {
  currentTs?: number;
  feeds?: Record<string, {
    ltpc?: { ltp?: number; ltt?: number };
    fullFeed?: {
      marketFF?: { ltpc?: { ltp?: number; ltt?: number } };
      indexFF?: { ltpc?: { ltp?: number; ltt?: number } };
    };
    firstLevelWithGreeks?: { ltpc?: { ltp?: number; ltt?: number } };
  }>;
};

let decoderPromise: Promise<Type> | null = null;

function getDecoder() {
  decoderPromise ??= load("/MarketDataFeedV3.proto").then((root) =>
    root.lookupType("com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse"),
  ).catch(error => { decoderPromise = null; throw error; });
  return decoderPromise;
}

function normalizeEpochMs(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 0) return NaN;
  if (value < 10_000_000_000) return value * 1_000;
  if (value > 10_000_000_000_000) return Math.floor(value / 1_000);
  return value;
}

function extractTick(payload: FeedObject, instrumentKey: string): UpstoxLiveTick | null {
  const feed = payload.feeds?.[instrumentKey];
  if (!feed) return null;
  const ltpc = feed.ltpc
    ?? feed.fullFeed?.marketFF?.ltpc
    ?? feed.fullFeed?.indexFF?.ltpc
    ?? feed.firstLevelWithGreeks?.ltpc;
  const price = Number(ltpc?.ltp);
  const timestampMs = normalizeEpochMs(Number(ltpc?.ltt ?? payload.currentTs));
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestampMs)) return null;
  return {
    instrumentKey,
    price,
    timestampMs,
  };
}

function cashSessionOpen(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (value.weekday === "Sat" || value.weekday === "Sun") return false;
  const minutes = Number(value.hour) * 60 + Number(value.minute);
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

async function messageBytes(data: unknown) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export async function openUpstoxLiveFeed({ instrumentKey, instrumentKeys: requestedInstrumentKeys, signal, onTick, onDisconnect }: LiveFeedOptions) {
  const instrumentKeys = [...new Set([instrumentKey, ...(requestedInstrumentKeys ?? [])].filter((value): value is string => Boolean(value)))];
  if (!instrumentKeys.length) throw new Error("Choose at least one instrument for the Upstox live feed.");
  const [decoder, response] = await Promise.all([
    getDecoder(),
    fetch("/api/upstox/stream-authorize", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }),
  ]);
  const authorization = await response.json() as {
    ok?: boolean;
    authorizedRedirectUri?: string;
    error?: { message?: string; retryAfterSeconds?: number };
  };
  if (!response.ok || !authorization.ok || !authorization.authorizedRedirectUri) {
    const error = new Error(authorization.error?.message ?? "Upstox live-feed authorization failed.") as Error & { retryAfterSeconds?: number };
    error.retryAfterSeconds = authorization.error?.retryAfterSeconds;
    throw error;
  }
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const socket = new WebSocket(authorization.authorizedRedirectUri);
  socket.binaryType = "arraybuffer";
  let intentionallyClosed = false;
  const openedAt = Date.now();
  let lastMessageAt = 0;
  let stopTimer = () => {};
  const recycle = (reason: string) => {
    if (intentionallyClosed || signal.aborted) return;
    if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) return;
    socket.close(4000, reason);
  };
  const onVisible = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const stale = socket.readyState !== WebSocket.OPEN || Date.now() - openedAt >= 8 * 60 * 1000 || (lastMessageAt > 0 && Date.now() - lastMessageAt >= 45_000);
    if (socket.readyState !== WebSocket.OPEN || (cashSessionOpen() && stale)) recycle("Resume live feed");
  };
  const stopWatch = () => {
    stopTimer();
    stopTimer = () => {};
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
  const abort = () => socket.close(1000, "Chart changed");
  signal.addEventListener("abort", abort, { once: true });

  // Subscribe to frames before sending the subscription so the initial quote
  // cannot be lost. Ignore queued frames after a chart has disconnected.
  socket.addEventListener("message", (event) => {
    lastMessageAt = Date.now();
    void messageBytes(event.data).then((bytes) => {
      if (!bytes || signal.aborted || intentionallyClosed) return;
      try {
        const decoded = decoder.decode(bytes);
        const payload = decoder.toObject(decoded, { longs: Number, enums: String }) as FeedObject;
        instrumentKeys.forEach((key) => {
          const tick = extractTick(payload, key);
          if (tick) onTick(tick);
        });
      } catch {
        // Ignore malformed/non-feed frames; REST reconciliation remains active.
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("error", fail);
      socket.removeEventListener("close", fail);
      socket.removeEventListener("open", opened);
    };
    const fail = () => {
      cleanup();
      stopWatch();
      signal.removeEventListener("abort", abort);
      intentionallyClosed = true;
      socket.close();
      reject(new Error("Unable to open the Upstox live market feed. Retrying automatically."));
    };
    const opened = () => {
      cleanup();
      socket.send(new TextEncoder().encode(JSON.stringify({
        guid: crypto.randomUUID(),
        method: "sub",
        data: { mode: "full", instrumentKeys },
      })));
      resolve();
    };
    const timeout = setTimeout(fail, 15_000);
    socket.addEventListener("error", fail, { once: true });
    socket.addEventListener("close", fail, { once: true });
    socket.addEventListener("open", opened, { once: true });
  });

  lastMessageAt = Date.now();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  const watchId = setInterval(() => {
    if (intentionallyClosed || signal.aborted || socket.readyState !== WebSocket.OPEN) return;
    if (typeof document !== "undefined" && document.hidden) return;
    // The V3 feed often dies just before 10 minutes and sends no close frame.
    if (cashSessionOpen() && Date.now() - openedAt >= 8 * 60 * 1000) recycle("Recycle live feed");
  }, 15_000);
  stopTimer = () => clearInterval(watchId);

  socket.addEventListener("close", () => {
    stopWatch();
    signal.removeEventListener("abort", abort);
    if (!signal.aborted && !intentionallyClosed) onDisconnect();
  });

  return () => {
    intentionallyClosed = true;
    stopWatch();
    signal.removeEventListener("abort", abort);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "Chart changed");
    }
  };
}
