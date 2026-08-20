"use client";

import { load, type Type } from "protobufjs";

export type UpstoxLiveTick = {
  price: number;
  timestampMs: number;
};

type LiveFeedOptions = {
  instrumentKey: string;
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
  );
  return decoderPromise;
}

function normalizeEpochMs(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return Date.now();
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
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    timestampMs: normalizeEpochMs(Number(ltpc?.ltt ?? payload.currentTs)),
  };
}

async function messageBytes(data: unknown) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export async function openUpstoxLiveFeed({ instrumentKey, signal, onTick, onDisconnect }: LiveFeedOptions) {
  const [decoder, response] = await Promise.all([
    getDecoder(),
    fetch("/api/upstox/stream-authorize", { cache: "no-store", signal }),
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
  const abort = () => socket.close(1000, "Chart changed");
  signal.addEventListener("abort", abort, { once: true });

  await new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error("Unable to open the Upstox live market feed."));
    const closeBeforeOpen = () => reject(new Error("Upstox closed the live market feed before it opened."));
    socket.addEventListener("error", fail, { once: true });
    socket.addEventListener("close", closeBeforeOpen, { once: true });
    socket.addEventListener("open", () => {
      socket.removeEventListener("error", fail);
      socket.removeEventListener("close", closeBeforeOpen);
      socket.send(new TextEncoder().encode(JSON.stringify({
        guid: crypto.randomUUID(),
        method: "sub",
        data: { mode: "full", instrumentKeys: [instrumentKey] },
      })));
      resolve();
    }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    void messageBytes(event.data).then((bytes) => {
      if (!bytes || signal.aborted) return;
      try {
        const decoded = decoder.decode(bytes);
        const payload = decoder.toObject(decoded, { longs: Number, enums: String }) as FeedObject;
        const tick = extractTick(payload, instrumentKey);
        if (tick) onTick(tick);
      } catch {
        // Ignore malformed/non-feed frames; a REST reconciliation remains active.
      }
    });
  });
  socket.addEventListener("close", () => {
    signal.removeEventListener("abort", abort);
    if (!signal.aborted) onDisconnect();
  });

  return () => {
    signal.removeEventListener("abort", abort);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "Chart changed");
    }
  };
}
