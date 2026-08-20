import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Your secure session is missing or expired. Please sign in again." }, { status: 401 });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Account deletion is temporarily unavailable." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return unauthorized();
  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) return unauthorized();

  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (body?.confirmation !== "DELETE") {
    return NextResponse.json({ error: "Deletion was not confirmed." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !data.user) return unauthorized();

  const { error: deletionError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deletionError) {
    return NextResponse.json({ error: "Account deletion could not be completed. Please contact support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
