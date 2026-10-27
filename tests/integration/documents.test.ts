import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { createDraftApplication, getApplicationDetail } from "@/server/services/applications";
import { authorizeDocumentDownload, removeDocument, reviewDocument, uploadDocument } from "@/server/services/documents";
import { assignApplication } from "@/server/services/assignments";
import { updateSettings } from "@/server/services/settings";
import { getStorage } from "@/server/storage/storage";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/server/errors";
import { samplePdf } from "@/lib/domain/demo";
import { actorFor, auditActions, createAgentActor, createCustomerActor, createUser, resetDatabase, submitDirectApplication, submitReferredApplication } from "./helpers";

let products: { HOME_LOAN: string; BUSINESS_LOAN: string };
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

beforeAll(async () => {
  products = await resetDatabase();
});

async function draftFor() {
  const customer = await createCustomerActor();
  const draft = await createDraftApplication(customer, { productId: products.HOME_LOAN });
  return { customer: await actorFor(customer.userId), draftId: draft.id };
}

describe("upload validation", () => {
  it("accepts a valid PDF, detects its type server-side and stores it privately", async () => {
    const { customer, draftId } = await draftFor();
    const res = await uploadDocument(customer, { applicationId: draftId, category: "IDENTITY_PROOF", filename: "../../evil/../id.pdf", bytes: samplePdf("id") });
    const [doc] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.id, res.id));
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.originalFilename).toBe("id.pdf");
    expect(doc.storageKey).toMatch(/^applications\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    expect(doc.scanStatus).toBe("CLEAN");
    expect((await getStorage().read(doc.storageKey)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await auditActions(res.id)).toContain("document.uploaded");
  });

  it("rejects disguised files, oversized files and unconfigured categories", async () => {
    const { customer, draftId } = await draftFor();
    await expect(
      uploadDocument(customer, { applicationId: draftId, category: "IDENTITY_PROOF", filename: "photo.pdf", bytes: Buffer.from("<html><script>alert(1)</script></html>") }),
    ).rejects.toBeInstanceOf(ValidationError);
    const big = Buffer.concat([samplePdf("big"), Buffer.alloc(3 * 1024 * 1024)]); // MAX_UPLOAD_MB=2 in tests
    await expect(uploadDocument(customer, { applicationId: draftId, category: "IDENTITY_PROOF", filename: "big.pdf", bytes: big })).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadDocument(customer, { applicationId: draftId, category: "FINANCIAL_STATEMENT", filename: "x.pdf", bytes: samplePdf("x") })).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks files that fail the malware scan and never stores them", async () => {
    const { customer, draftId } = await draftFor();
    const infected = Buffer.concat([samplePdf("eicar"), Buffer.from(EICAR, "latin1")]);
    await expect(uploadDocument(customer, { applicationId: draftId, category: "ADDRESS_PROOF", filename: "a.pdf", bytes: infected })).rejects.toBeInstanceOf(ValidationError);
    const docs = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.applicationId, draftId));
    expect(docs).toHaveLength(0);
    expect(await auditActions(draftId)).toContain("document.malware_blocked");
  });

  it("only the applicant side can upload", async () => {
    const { draftId } = await draftFor();
    const stranger = await createCustomerActor();
    await expect(uploadDocument(stranger, { applicationId: draftId, category: "IDENTITY_PROOF", filename: "x.pdf", bytes: samplePdf("x") })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("allows removal in drafts only and deletes the bytes", async () => {
    const { customer, draftId } = await draftFor();
    const res = await uploadDocument(customer, { applicationId: draftId, category: "IDENTITY_PROOF", filename: "x.pdf", bytes: samplePdf("x") });
    const [doc] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.id, res.id));
    await removeDocument(customer, res.id);
    const [after] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.id, res.id));
    expect(after.status).toBe("REMOVED");
    await expect(getStorage().read(doc.storageKey)).rejects.toThrow();
  });
});

describe("download authorization", () => {
  it("lets the owner, assigned staff and admins download; denies everyone else", async () => {
    const customer = await createCustomerActor();
    const { id, customer: owner } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    const [doc] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.applicationId, id));
    await expect(authorizeDocumentDownload(owner, doc.id)).resolves.toMatchObject({ mimeType: "application/pdf" });

    const otherCustomer = await createCustomerActor();
    const officer = await actorFor((await createUser("loan_officer")).id);
    const agent = await createAgentActor();
    await expect(authorizeDocumentDownload(otherCustomer, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(authorizeDocumentDownload(officer, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(authorizeDocumentDownload(agent, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(authorizeDocumentDownload(owner, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);

    const admin = await actorFor((await createUser("admin")).id);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    await expect(authorizeDocumentDownload(officer, doc.id)).resolves.toBeTruthy();
    await expect(authorizeDocumentDownload(admin, doc.id)).resolves.toBeTruthy();
    expect(await auditActions(doc.id)).toContain("document.downloaded");
  });

  it("agents can download only files they uploaded themselves", async () => {
    const agent = await createAgentActor();
    const { id } = await submitReferredApplication(agent, products.HOME_LOAN);
    const [doc] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.applicationId, id));
    await expect(authorizeDocumentDownload(agent, doc.id)).resolves.toBeTruthy();
  });
});

describe("staff review", () => {
  it("records audited verification decisions and enforces review rules", async () => {
    const customer = await createCustomerActor();
    const { id, customer: owner } = await submitDirectApplication(customer, products.BUSINESS_LOAN);
    const admin = await actorFor((await createUser("admin")).id);
    const officer = await actorFor((await createUser("loan_officer")).id);
    const docs = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.applicationId, id));

    // Not assigned yet → no access.
    await expect(reviewDocument(officer, docs[0].id, { decision: "VERIFIED" })).rejects.toBeInstanceOf(NotFoundError);
    await assignApplication(admin, id, { assigneeId: officer.userId });
    await reviewDocument(officer, docs[0].id, { decision: "VERIFIED", notes: "Matches" });
    await expect(reviewDocument(officer, docs[1].id, { decision: "REJECTED" })).rejects.toBeInstanceOf(ValidationError); // reason required
    await reviewDocument(officer, docs[1].id, { decision: "REJECTED", rejectionReason: "Image is blurred, please re-upload" });
    expect(await auditActions(docs[0].id)).toContain("document.verified");
    expect(await auditActions(docs[1].id)).toContain("document.rejected");
    const reviews = await db.select().from(s.documentReviews).where(eq(s.documentReviews.documentId, docs[1].id));
    expect(reviews).toHaveLength(1);

    // Customer replaces the rejected document during review.
    const replacement = await uploadDocument(owner, { applicationId: id, category: docs[1].category, filename: "clear.pdf", bytes: samplePdf("clear"), replacesDocumentId: docs[1].id });
    const [old] = await db.select().from(s.applicationDocuments).where(eq(s.applicationDocuments.id, docs[1].id));
    expect(old.status).toBe("REPLACED");
    // Verified documents cannot be replaced.
    await expect(
      uploadDocument(owner, { applicationId: id, category: docs[0].category, filename: "x.pdf", bytes: samplePdf("x"), replacesDocumentId: docs[0].id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);

    // With "require clean scan", unscanned files cannot be verified.
    const superAdmin = await actorFor((await createUser("super_admin")).id);
    await updateSettings(superAdmin, { "documents.requireCleanScan": true });
    await db.update(s.applicationDocuments).set({ scanStatus: "NOT_SCANNED" }).where(eq(s.applicationDocuments.id, replacement.id));
    await expect(reviewDocument(officer, replacement.id, { decision: "VERIFIED" })).rejects.toBeInstanceOf(BusinessRuleError);
    await updateSettings(superAdmin, { "documents.requireCleanScan": false });

    const detail = await getApplicationDetail(owner, id);
    expect(detail.documents.find((d) => d.id === docs[1].id)).toBeUndefined(); // replaced docs hidden
  });
});
