import { NextResponse } from "next/server";
import { getCurrentActor } from "@/server/auth/current";
import { uploadDocument } from "@/server/services/documents";
import { assertSameOrigin, csrfResponse, errorResponse, isCsrfError } from "@/server/http";
import { AuthenticationError, ValidationError } from "@/server/errors";
import { env } from "@/server/config/env";

/**
 * Multipart document upload: fields `file`, `category`, optional `replacesDocumentId`.
 * All validation (authorization, status, size, signature, malware scan) happens in the document service.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/applications/[id]/documents">) {
  try {
    assertSameOrigin(request);
  } catch (e) {
    if (isCsrfError(e)) return csrfResponse();
    throw e;
  }
  try {
    const actor = await getCurrentActor();
    if (!actor) throw new AuthenticationError();
    const { id } = await ctx.params;
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
    if (declaredLength > maxBytes + 64 * 1024) {
      throw new ValidationError(undefined, { file: [`Files must be ${env().MAX_UPLOAD_MB} MB or smaller`] });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError(undefined, { file: ["Choose a file to upload"] });
    if (file.size > maxBytes) throw new ValidationError(undefined, { file: [`Files must be ${env().MAX_UPLOAD_MB} MB or smaller`] });
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadDocument(actor, {
      applicationId: id,
      category: String(form.get("category") ?? ""),
      filename: file.name,
      bytes,
      replacesDocumentId: (form.get("replacesDocumentId") as string | null) || null,
    });
    return NextResponse.json({ document: result }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
