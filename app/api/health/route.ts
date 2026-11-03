import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: { status: "ok", timestamp: new Date().toISOString() },
    error: null,
  });
}
