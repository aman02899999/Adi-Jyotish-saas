import { NextResponse } from "next/server";
import { revokePractitionerSession } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await revokePractitionerSession();
  return NextResponse.redirect(new URL("/practitioner/login", request.url), { status: 303 });
}
