import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { applicationDocuments, documentReviews, informationRequests } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requirePermission } from "@/server/rbac/authorize";
import { canActAsApplicant, hasStaffAuthority } from "@/server/rbac/application-access";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { env } from "@/server/config/env";
import { consumeRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { getStorage } from "@/server/storage/storage";
import { getScanner } from "@/server/scanner/scanner";
import { logger } from "@/server/logger";
import { ALLOWED_DOCUMENT_TYPES, detectMimeType, sanitizeFilename } from "@/lib/domain/file-signature";
import { DOCUMENT_CATEGORIES, type DocumentCategoryValue } from "@/lib/domain/labels";
import { UPLOAD_STATUSES } from "@/lib/domain/workflow";
import { templates } from "@/server/email/templates";
import { recordAudit } from "./audit";
import { loadApplication, loadApplicationForView } from "./application-access";
import { getProductDocuments } from "./products";
import { getSetting } from "./settings";
import { appUrl, enqueueEmail, notifyUser, scheduleDispatch } from "./notifications";
import { MAX_DOCS_PER_CATEGORY } from "./applications";

export interface UploadInput {
  applicationId: string;
  category: string;
  filename: string;
  bytes: Buffer;
  replacesDocumentId?: string | null;
}

/**
 * Validates and stores an uploaded document:
 *  - applicant-side authority and an upload-permitting application status
 *  - category must be configured for the product (or OTHER)
 *  - size limit and server-side signature detection (browser MIME type is ignored)
 *  - malware scan; infected files are rejected and never stored
 *  - opaque storage key in private storage; metadata in Postgres
 */
export async function uploadDocument(actor: Actor, input: UploadInput) {
  requirePermission(actor, "applications.create");
  await consumeRateLimit(RATE_LIMITS.upload, actor.userId);
  const category = z.enum(DOCUMENT_CATEGORIES).safeParse(input.category);
  if (!category.success) throw new ValidationError(undefined, { category: ["Select a document type"] });

  // Authorization + state checks before reading/scanning bytes.
  const pre = await loadApplication(db, input.applicationId);
  if (!canActAsApplicant(actor, pre.facts)) throw new NotFoundError();
  if (!(UPLOAD_STATUSES as readonly string[]).includes(pre.app.status)) {
    throw new BusinessRuleError("Documents cannot be uploaded at this stage of the application.");
  }
  const productDocs = await getProductDocuments(db, pre.app.productId);
  if (category.data !== "OTHER" && !productDocs.some((d) => d.category === category.data)) {
    throw new ValidationError(undefined, { category: ["This document type is not used for this loan product"] });
  }

  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  if (input.bytes.length === 0) throw new ValidationError(undefined, { file: ["The file is empty"] });
  if (input.bytes.length > maxBytes) throw new ValidationError(undefined, { file: [`Files must be ${env().MAX_UPLOAD_MB} MB or smaller`] });
  const mime = detectMimeType(input.bytes);
  if (!mime) {
    const allowed = Object.values(ALLOWED_DOCUMENT_TYPES).map((t) => t.label).join(", ");
    throw new ValidationError(undefined, { file: [`Unsupported file type. Allowed formats: ${allowed}`] });
  }

  const scan = await getScanner().scan(input.bytes);
  if (scan === "INFECTED") {
    await recordAudit(db, {
      actor: auditActor(actor),
      action: "document.malware_blocked",
      entityType: "loan_application",
      entityId: input.applicationId,
      after: { category: category.data, sizeBytes: input.bytes.length },
    });
    throw new ValidationError(undefined, { file: ["This file failed the security scan and was not accepted"] });
  }

  const storageKey = `applications/${input.applicationId}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  await getStorage().put(storageKey, input.bytes, mime);

  try {
    return await db.transaction(async (tx) => {
      const loaded = await loadApplication(tx, input.applicationId, { lock: true });
      if (!canActAsApplicant(actor, loaded.facts)) throw new NotFoundError();
      if (!(UPLOAD_STATUSES as readonly string[]).includes(loaded.app.status)) {
        throw new BusinessRuleError("Documents cannot be uploaded at this stage of the application.");
      }
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(applicationDocuments)
        .where(
          and(
            eq(applicationDocuments.applicationId, input.applicationId),
            eq(applicationDocuments.category, category.data),
            inArray(applicationDocuments.status, ["PENDING_REVIEW", "VERIFIED"]),
          ),
        );
      let replaces: typeof applicationDocuments.$inferSelect | undefined;
      if (input.replacesDocumentId) {
        [replaces] = await tx
          .select()
          .from(applicationDocuments)
          .where(and(eq(applicationDocuments.id, input.replacesDocumentId), eq(applicationDocuments.applicationId, input.applicationId)))
          .limit(1);
        if (!replaces) throw new NotFoundError();
        if (replaces.status === "VERIFIED") throw new BusinessRuleError("Verified documents cannot be replaced.");
        if (!["PENDING_REVIEW", "REJECTED"].includes(replaces.status)) throw new BusinessRuleError("This document can no longer be replaced.");
        if (replaces.status === "PENDING_REVIEW" && loaded.app.status !== "DRAFT") {
          throw new BusinessRuleError("This document is being reviewed. You can replace it if it is rejected.");
        }
      }
      if (!replaces && n >= MAX_DOCS_PER_CATEGORY) {
        throw new BusinessRuleError(`You can upload at most ${MAX_DOCS_PER_CATEGORY} files per document type.`);
      }
      // Link uploads made while information is outstanding to the open request.
      const [openRequest] = await tx
        .select({ id: informationRequests.id })
        .from(informationRequests)
        .where(and(eq(informationRequests.applicationId, input.applicationId), eq(informationRequests.status, "OPEN")))
        .limit(1);

      const [doc] = await tx
        .insert(applicationDocuments)
        .values({
          applicationId: input.applicationId,
          category: category.data,
          originalFilename: sanitizeFilename(input.filename),
          storageKey,
          sizeBytes: input.bytes.length,
          mimeType: mime,
          sha256,
          status: "PENDING_REVIEW",
          scanStatus: scan,
          scannedAt: scan === "NOT_SCANNED" ? null : new Date(),
          uploadedById: actor.userId,
          replacesDocumentId: replaces?.id ?? null,
          infoRequestId: openRequest?.id ?? null,
        })
        .returning({ id: applicationDocuments.id });
      if (replaces) {
        await tx.update(applicationDocuments).set({ status: "REPLACED" }).where(eq(applicationDocuments.id, replaces.id));
      }
      await recordAudit(tx, {
        actor: auditActor(actor),
        action: replaces ? "document.replaced" : "document.uploaded",
        entityType: "application_document",
        entityId: doc.id,
        after: { applicationId: input.applicationId, category: category.data, mimeType: mime, sizeBytes: input.bytes.length, scan, replaces: replaces?.id ?? null },
      });
      return { id: doc.id, scanStatus: scan };
    });
  } catch (err) {
    // Do not leave orphaned bytes when the metadata transaction fails.
    await getStorage()
      .delete(storageKey)
      .catch((e) => logger.warn("failed to clean up orphaned upload", { error: (e as Error).message }));
    throw err;
  }
}

/** Remove a document from a DRAFT application. The bytes are deleted (data minimisation); metadata is retained. */
export async function removeDocument(actor: Actor, documentId: string) {
  requirePermission(actor, "applications.create");
  const key = await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).for("update").limit(1);
    if (!doc) throw new NotFoundError();
    const loaded = await loadApplication(tx, doc.applicationId, { lock: true });
    if (!canActAsApplicant(actor, loaded.facts)) throw new NotFoundError();
    if (loaded.app.status !== "DRAFT") throw new BusinessRuleError("Documents can only be removed while the application is a draft.");
    if (doc.status !== "PENDING_REVIEW") throw new BusinessRuleError("This document cannot be removed.");
    await tx.update(applicationDocuments).set({ status: "REMOVED", removedAt: new Date(), removedById: actor.userId }).where(eq(applicationDocuments.id, documentId));
    await recordAudit(tx, { actor: auditActor(actor), action: "document.removed", entityType: "application_document", entityId: documentId });
    return doc.storageKey;
  });
  await getStorage()
    .delete(key)
    .catch((e) => logger.warn("failed to delete removed document bytes", { error: (e as Error).message }));
}

export const reviewDocumentSchema = z
  .object({
    decision: z.enum(["VERIFIED", "REJECTED"]),
    notes: z.string().trim().max(1000).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.rejectionReason && v.rejectionReason.length >= 5), {
    path: ["rejectionReason"],
    message: "Explain why the document is rejected (shown to the applicant)",
  });

/**
 * Explicit staff verification. Verification records that a reviewer checked the document; it does not
 * assert authenticity beyond that human review (no external verification service is configured).
 */
export async function reviewDocument(actor: Actor, documentId: string, input: unknown) {
  requirePermission(actor, "applications.review_documents");
  const parsed = reviewDocumentSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  const { decision, notes, rejectionReason } = parsed.data;
  await db.transaction(async (tx) => {
    const [doc] = await tx.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).for("update").limit(1);
    if (!doc) throw new NotFoundError();
    const loaded = await loadApplication(tx, doc.applicationId, { lock: true });
    if (!hasStaffAuthority(actor, loaded.facts)) throw new NotFoundError();
    if (!["DOCUMENT_REVIEW", "INFORMATION_REQUIRED"].includes(loaded.app.status)) {
      throw new BusinessRuleError("Documents can only be reviewed while the application is in document review.");
    }
    if (!["PENDING_REVIEW", "VERIFIED", "REJECTED"].includes(doc.status)) throw new BusinessRuleError("This document is no longer active.");
    if (doc.status === decision) return;
    if (decision === "VERIFIED") {
      if (doc.scanStatus === "INFECTED") throw new BusinessRuleError("Files that failed malware scanning cannot be verified.");
      if (doc.scanStatus !== "CLEAN" && (await getSetting("documents.requireCleanScan"))) {
        throw new BusinessRuleError("A clean malware scan is required before this document can be verified.");
      }
    }
    await tx
      .update(applicationDocuments)
      .set({
        status: decision,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? rejectionReason : null,
      })
      .where(eq(applicationDocuments.id, documentId));
    await tx.insert(documentReviews).values({ documentId, reviewerId: actor.userId, decision, notes: [notes, rejectionReason].filter(Boolean).join(" | ") || null });
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: decision === "VERIFIED" ? "document.verified" : "document.rejected",
      entityType: "application_document",
      entityId: documentId,
      before: { status: doc.status },
      after: { status: decision, applicationId: doc.applicationId, category: doc.category },
      reason: rejectionReason ?? notes ?? null,
    });
    if (decision === "REJECTED") {
      const { customer, app } = loaded;
      const email = templates.documentRejected({ name: customer.fullName, reference: app.reference, url: appUrl(`/customer/applications/${app.id}`) });
      if (customer.userId) {
        await notifyUser(tx, customer.userId, {
          template: "document_rejected",
          email,
          linkPath: `/customer/applications/${app.id}`,
          entityType: "application_document",
          entityId: documentId,
          inAppText: `A ${doc.category.replace(/_/g, " ").toLowerCase()} document needs to be re-uploaded: ${rejectionReason}`,
          dedupeKey: `doc-rejected:${documentId}:${Date.now()}`,
        });
      } else {
        await enqueueEmail(tx, { to: customer.email, template: "document_rejected", email, dedupeKey: `doc-rejected:${documentId}:${Date.now()}` });
      }
    }
  });
  scheduleDispatch();
}

/**
 * Authorizes a download and returns how to serve it. Customers can download their own application's
 * documents; agents only files they uploaded; staff/admins per application access.
 */
export async function authorizeDocumentDownload(actor: Actor, documentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new NotFoundError();
  await consumeRateLimit(RATE_LIMITS.download, actor.userId);
  const [doc] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).limit(1);
  if (!doc) throw new NotFoundError();
  const { level } = await loadApplicationForView(db, actor, doc.applicationId);
  if (level === "agent" && doc.uploadedById !== actor.userId) throw new NotFoundError();
  if (doc.status === "REMOVED") throw new NotFoundError();
  if (doc.scanStatus === "INFECTED") throw new BusinessRuleError("This file failed malware scanning and cannot be downloaded.");
  await recordAudit(db, {
    actor: auditActor(actor),
    action: "document.downloaded",
    entityType: "application_document",
    entityId: documentId,
    after: { applicationId: doc.applicationId, viewLevel: level },
  });
  return { storageKey: doc.storageKey, filename: doc.originalFilename, mimeType: doc.mimeType };
}

export async function getDocumentReviewHistory(actor: Actor, applicationId: string) {
  const { level } = await loadApplicationForView(db, actor, applicationId);
  if (level !== "admin" && level !== "staff") throw new NotFoundError();
  return db.execute<{ id: string; document_id: string; decision: string; notes: string | null; created_at: Date; reviewer_name: string; category: DocumentCategoryValue }>(sql`
    select dr.id, dr.document_id, dr.decision, dr.notes, dr.created_at, u.name as reviewer_name, d.category
    from document_reviews dr
    join application_documents d on d.id = dr.document_id
    join users u on u.id = dr.reviewer_id
    where d.application_id = ${applicationId}
    order by dr.created_at desc
  `);
}

