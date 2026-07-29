import "server-only";

export class UpstoxServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isUpstoxConfigured() {
  return Boolean(process.env.UPSTOX_ACCESS_TOKEN?.trim());
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
      throw new UpstoxServerError(429, "RATE_LIMITED", "Upstox rate limit reached. Please wait before retrying.");
    }
    throw new UpstoxServerError(502, "UPSTREAM_ERROR", `Upstox market data returned HTTP ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

export function upstoxErrorResponse(error: unknown) {
  if (error instanceof UpstoxServerError) {
    return Response.json(
      { ok: false, source: "upstox", error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
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
