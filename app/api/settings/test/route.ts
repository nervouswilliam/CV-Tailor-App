import { NextResponse } from "next/server";
import { testConnection, type Provider } from "@/lib/ai";
import { getSettings } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const settings = await getSettings();
    const model = (body.model as string) || settings.model;
    const provider = ((body.provider as string) || settings.provider) as Provider;
    return NextResponse.json(await testConnection(model, provider));
  } catch (e) {
    return errorResponse(e);
  }
}
