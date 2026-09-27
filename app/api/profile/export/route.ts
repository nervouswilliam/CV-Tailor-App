import { getProfile } from "@/lib/store";
import { profileToMarkdown } from "@/lib/profile-md";
import { errorResponse } from "@/lib/http";
import { attachmentContext } from "@/lib/attachments";

export async function GET(req: Request) {
  try {
    const format = new URL(req.url).searchParams.get("format") ?? "json";
    const profile = await getProfile();
    const date = new Date().toISOString().slice(0, 10);
    if (format === "md") {
      return new Response(profileToMarkdown(profile, { withIds: false, attachments: await attachmentContext() }), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="profile-${date}.md"`,
        },
      });
    }
    return new Response(JSON.stringify(profile, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="profile-${date}.json"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
