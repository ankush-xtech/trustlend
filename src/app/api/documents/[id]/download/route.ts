import { NextResponse } from "next/server";
import { getCurrentActor } from "@/server/auth/current";
import { authorizeDocumentDownload } from "@/server/services/documents";
import { contentDisposition, getStorage } from "@/server/storage/storage";
import { errorResponse } from "@/server/http";
import { AuthenticationError } from "@/server/errors";

/**
 * Authorized document access. With S3 the user is redirected to a short-lived signed URL; with local
 * development storage the bytes are streamed by the app. There are no permanent public document links.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/download">) {
  try {
    const actor = await getCurrentActor();
    if (!actor) throw new AuthenticationError();
    const { id } = await ctx.params;
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    const doc = await authorizeDocumentDownload(actor, id);
    const storage = getStorage();
    const signed = await storage.signedDownloadUrl(doc.storageKey, { filename: doc.filename, contentType: doc.mimeType, inline });
    if (signed) {
      return NextResponse.redirect(signed, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    const bytes = await storage.read(doc.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentDisposition(doc.filename, inline),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
