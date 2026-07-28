import { NextResponse } from "next/server";
import { revokeMemberSession } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await revokeMemberSession();
  return NextResponse.redirect(new URL("/account", request.url), { status: 303 });
}
