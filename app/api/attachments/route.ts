import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { newRowId } from "@/lib/ids";
import { errorResponse } from "@/lib/http";
import { ACCEPTED_EXTENSIONS, ExtractError, MAX_UPLOAD_BYTES, extractDocumentText } from "@/lib/extract";
import { ATTACHMENT_DIR, ITEM_TYPES, MAX_SUMMARY_CHARS, summariseAttachment, toDto, type ItemType } from "@/lib/attachments";
import { logActivity } from "@/lib/store";

export async function GET(req: Request) {
  try {
    const itemId = new URL(req.url).searchParams.get("itemId");
    const rows = await prisma.attachment.findMany({ where: itemId ? { itemId } : {}, orderBy: { createdAt: "asc" } });
    return NextResponse.json(rows.map(toDto));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Upload a document for a profile item (multipart: file, itemId, itemType, itemLabel).
 * Text is extracted immediately; the AI summary runs in the background (poll GET).
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const itemId = String(form.get("itemId") ?? "");
    const itemType = String(form.get("itemType") ?? "") as ItemType;
    const itemLabel = String(form.get("itemLabel") ?? "").slice(0, 200);
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!itemId || !ITEM_TYPES.includes(itemType)) return NextResponse.json({ error: "Missing item" }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      return NextResponse.json({ error: `Unsupported file type "${ext}". Use PDF, PPTX, DOCX, TXT or MD.` }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File is larger than 25 MB." }, { status: 400 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractDocumentText(bytes, file.name);
    } catch (e) {
      if (e instanceof ExtractError) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }

    const id = newRowId();
    await fs.mkdir(ATTACHMENT_DIR, { recursive: true });
    const filePath = path.join(ATTACHMENT_DIR, `${id}${ext}`);
    await fs.writeFile(filePath, bytes);
    const row = await prisma.attachment.create({
      data: {
        id,
        itemId,
        itemType,
        itemLabel,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        filePath,
        extractedText: text,
        truncated: text.length > MAX_SUMMARY_CHARS,
      },
    });
    await logActivity("profile", `Attached ${file.name} to ${itemLabel}`);
    void summariseAttachment(id); // background: status becomes "ready" or "error"
    return NextResponse.json(toDto(row));
  } catch (e) {
    return errorResponse(e);
  }
}
