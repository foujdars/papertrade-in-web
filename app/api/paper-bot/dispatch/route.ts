// Retired with Algo Trading and Trading Bot. Keep this route lightweight so
// stale clients and external schedulers cannot start background market work.
export const runtime = 'nodejs';

export async function POST() {
  return Response.json(
    { ok: false, retired: true, error: 'Trading Bot has been retired. Disable the scheduler calling this endpoint.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
