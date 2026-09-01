import "server-only";

export class UpstoxServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

type CachedResponse = { value: unknown; storedAt: number; expiresAt: number; staleUntil: number };
const responseCache = new Map<string, CachedResponse>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function cachePolicy(path: string) {
  // Quotes are never served stale because they can execute a paper order or protective exit.
  if (path.includes("market-quote/quotes")) return { freshMs: 5_000, staleMs: 5_000 };
  if (path.includes("/v2/ipos")) return { freshMs: 30_000, staleMs: 5 * 60_000 };
  if (path.includes("historical-candle/intraday")) return { freshMs: 12_000, staleMs: 10 * 60_000 };
  if (path.includes("historical-candle")) return { freshMs: 5 * 60_000, staleMs: 60 * 60_000 };
  return { freshMs: 10_000, staleMs: 60_000 };
}

export function isUpstoxConfigured() {
  return Boolean(process.env.UPSTOX_ACCESS_TOKEN?.trim());
}

export async function authorizeUpstoxMarketFeed() {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new UpstoxServerError(
      503,
      "TOKEN_MISSING",
      "UPSTOX_ACCESS_TOKEN is not configured in the production environment.",
    );
  }

  const response = await fetch("https://api.upstox.com/v3/feed/market-data-feed/authorize", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new UpstoxServerError(401, "TOKEN_INVALID", "The Upstox token is invalid or expired.");
    }
    if (response.status === 403) {
      throw new UpstoxServerError(403, "ACCESS_DENIED", "This Upstox token cannot access the live market feed.");
    }
    if (response.status === 429) {
      const retryHeader = Number(response.headers.get("retry-after"));
      const retryAfterSeconds = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 30;
      throw new UpstoxServerError(
        429,
        "RATE_LIMITED",
        `Upstox live-feed authorization is temporarily rate limited. Retrying after ${retryAfterSeconds} seconds.`,
        retryAfterSeconds,
      );
    }
    throw new UpstoxServerError(502, "UPSTREAM_ERROR", `Upstox live-feed authorization returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as {
    status?: string;
    data?: { authorizedRedirectUri?: string; authorized_redirect_uri?: string };
  };
  const authorizedRedirectUri = payload.data?.authorizedRedirectUri ?? payload.data?.authorized_redirect_uri;
  if (!authorizedRedirectUri?.startsWith("wss://")) {
    throw new UpstoxServerError(502, "INVALID_FEED_URL", "Upstox did not return a valid live-feed connection URL.");
  }
  return authorizedRedirectUri;
}

export async function upstoxFetch<T>(path: string): Promise<T> {
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new UpstoxServerError(
      503,
      "TOKEN_MISSING",
      "UPSTOX_ACCESS_TOKEN is not configured in the production environment.",
    );
  }

  const now = Date.now();
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > now) return cached.value as T;
  const pending = inFlightRequests.get(path);
  if (pending) return pending as Promise<T>;

  const request = (async () => {
    const response = await fetch(`https://api.upstox.com${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new UpstoxServerError(401, "TOKEN_INVALID", "The Upstox token is invalid or expired.");
      }
      if (response.status === 403) {
        throw new UpstoxServerError(403, "ACCESS_DENIED", "This Upstox token cannot access the requested market data.");
      }
      if (response.status === 429) {
        if (cached && cached.staleUntil > Date.now()) return cached.value as T;
        const retryHeader = Number(response.headers.get("retry-after"));
        const retryAfterSeconds = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 30;
        throw new UpstoxServerError(429, "RATE_LIMITED", `Upstox is temporarily rate limited. Retrying after ${retryAfterSeconds} seconds.`, retryAfterSeconds);
      }
      if (cached && cached.staleUntil > Date.now()) return cached.value as T;
      throw new UpstoxServerError(502, "UPSTREAM_ERROR", `Upstox market data returned HTTP ${response.status}.`);
    }

    const value = await response.json() as T;
    const policy = cachePolicy(path);
    responseCache.set(path, {
      value,
      storedAt: Date.now(),
      expiresAt: Date.now() + policy.freshMs,
      staleUntil: Date.now() + policy.staleMs,
    });
    return value;
  })();
  inFlightRequests.set(path, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(path);
  }
}

export function upstoxErrorResponse(error: unknown) {
  if (error instanceof UpstoxServerError) {
    return Response.json(
      { ok: false, source: "upstox", error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds } },
      { status: error.status, headers: { "Cache-Control": "no-store", ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {}) } },
    );
  }
  return Response.json(
    {
      ok: false,
      source: "upstox",
      error: { code: "UNEXPECTED_ERROR", message: "Unable to load Upstox market data." },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
