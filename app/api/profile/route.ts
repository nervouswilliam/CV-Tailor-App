import { NextResponse } from "next/server";
import { getProfile, saveProfile, logActivity } from "@/lib/store";
import { ProfileSchema } from "@/lib/schemas";
import { errorResponse } from "@/lib/http";
import { pruneAttachments } from "@/lib/attachments";

export async function GET() {
  try {
    return NextResponse.json(await getProfile());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const profile = ProfileSchema.parse(body.profile);
    const saved = await saveProfile(profile);
    // Documents attached to items that were deleted from the profile go with them.
    await pruneAttachments(
      new Set([
        ...saved.companies.flatMap((c) => c.roles.map((r) => r.id)),
        ...saved.projects.map((p) => p.id),
        ...saved.activities.map((a) => a.id),
        ...saved.education.map((e) => e.id),
      ]),
    );
    if (body.activity) await logActivity("profile", String(body.activity));
    return NextResponse.json(saved);
  } catch (e) {
    return errorResponse(e);
  }
}

// navigator.sendBeacon (flush on page unload) can only POST.
export const POST = PUT;
