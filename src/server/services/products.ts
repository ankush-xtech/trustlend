import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db/client";
import { qcol } from "@/server/db/sql";
import { loanProductDocuments, loanProducts } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/actor";
import { auditActor } from "@/server/rbac/actor";
import { requireAnyPermission, requirePermission } from "@/server/rbac/authorize";
import { NotFoundError, ValidationError, isUniqueViolation } from "@/server/errors";
import { productDocumentsSchema, productInputSchema } from "@/lib/validation/product";
import type { ApplicantTypeValue } from "@/lib/domain/product-config";
import { recordAudit } from "./audit";

export type LoanProduct = typeof loanProducts.$inferSelect;
export type LoanProductDocument = typeof loanProductDocuments.$inferSelect;

/** Public catalog: active products only, public fields only. */
export async function listActiveProducts() {
  return db
    .select({
      id: loanProducts.id,
      slug: loanProducts.slug,
      name: loanProducts.name,
      shortDescription: loanProducts.shortDescription,
      description: loanProducts.description,
      currency: loanProducts.currency,
      minAmount: loanProducts.minAmount,
      maxAmount: loanProducts.maxAmount,
      config: loanProducts.config,
      isIllustrative: loanProducts.isIllustrative,
    })
    .from(loanProducts)
    .where(eq(loanProducts.isActive, true))
    .orderBy(asc(loanProducts.sortOrder), asc(loanProducts.name));
}

export async function getActiveProductBySlug(slug: string) {
  const [product] = await db.select().from(loanProducts).where(eq(loanProducts.slug, slug)).limit(1);
  if (!product || !product.isActive) return null;
  const documents = await getProductDocuments(db, product.id);
  return { product, documents };
}

export async function getProductDocuments(conn: DbOrTx, productId: string) {
  return conn
    .select()
    .from(loanProductDocuments)
    .where(eq(loanProductDocuments.productId, productId))
    .orderBy(asc(loanProductDocuments.sortOrder));
}

/** Document requirements applicable to an applicant type. */
export function requirementsFor(docs: LoanProductDocument[], applicantType: ApplicantTypeValue | null | undefined) {
  return docs.filter((d) => !d.applicantTypes || d.applicantTypes.length === 0 || (applicantType && d.applicantTypes.includes(applicantType)));
}

export async function listProductsAdmin(actor: Actor) {
  requireAnyPermission(actor, "loan_products.manage", "loan_products.read");
  return db
    .select({
      id: loanProducts.id,
      code: loanProducts.code,
      slug: loanProducts.slug,
      name: loanProducts.name,
      isActive: loanProducts.isActive,
      minAmount: loanProducts.minAmount,
      maxAmount: loanProducts.maxAmount,
      currency: loanProducts.currency,
      isIllustrative: loanProducts.isIllustrative,
      applicationCount: sql<number>`(select count(*)::int from loan_applications la where la.product_id = ${qcol(loanProducts.id)})`,
      documentCount: sql<number>`(select count(*)::int from loan_product_documents d where d.product_id = ${qcol(loanProducts.id)})`,
    })
    .from(loanProducts)
    .orderBy(asc(loanProducts.sortOrder), asc(loanProducts.name));
}

export async function getProductAdmin(actor: Actor, productId: string) {
  requireAnyPermission(actor, "loan_products.manage", "loan_products.read");
  const [product] = await db.select().from(loanProducts).where(eq(loanProducts.id, productId)).limit(1);
  if (!product) throw new NotFoundError();
  return { product, documents: await getProductDocuments(db, productId) };
}

export async function createProduct(actor: Actor, input: unknown) {
  requirePermission(actor, "loan_products.manage");
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  return db.transaction(async (tx) => {
    try {
      const [p] = await tx.insert(loanProducts).values(parsed.data).returning({ id: loanProducts.id });
      await recordAudit(tx, { actor: auditActor(actor), action: "loan_product.created", entityType: "loan_product", entityId: p.id, after: parsed.data });
      return p.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationError("A product with this code or slug already exists.", { code: ["Already in use"], slug: ["Already in use"] });
      throw e;
    }
  });
}

export async function updateProduct(actor: Actor, productId: string, input: unknown) {
  requirePermission(actor, "loan_products.manage");
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, z.flattenError(parsed.error).fieldErrors);
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(loanProducts).where(eq(loanProducts.id, productId)).for("update").limit(1);
    if (!before) throw new NotFoundError();
    try {
      await tx
        .update(loanProducts)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(loanProducts.id, productId));
    } catch (e) {
      if (isUniqueViolation(e)) throw new ValidationError("A product with this code or slug already exists.");
      throw e;
    }
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "loan_product.updated",
      entityType: "loan_product",
      entityId: productId,
      before: { name: before.name, isActive: before.isActive, minAmount: before.minAmount, maxAmount: before.maxAmount, config: before.config },
      after: parsed.data,
    });
  });
}

/** Replaces the product's document requirements. Existing applications keep their uploaded documents. */
export async function setProductDocuments(actor: Actor, productId: string, input: unknown) {
  requirePermission(actor, "loan_products.manage");
  const parsed = productDocumentsSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid document requirements");
  await db.transaction(async (tx) => {
    const [product] = await tx.select({ id: loanProducts.id }).from(loanProducts).where(eq(loanProducts.id, productId)).limit(1);
    if (!product) throw new NotFoundError();
    const before = await getProductDocuments(tx, productId);
    await tx.delete(loanProductDocuments).where(eq(loanProductDocuments.productId, productId));
    if (parsed.data.length) {
      await tx.insert(loanProductDocuments).values(
        parsed.data.map((d, i) => ({
          productId,
          category: d.category,
          label: d.label,
          description: d.description,
          isRequired: d.isRequired,
          applicantTypes: d.applicantTypes && d.applicantTypes.length ? d.applicantTypes : null,
          sortOrder: i,
        })),
      );
    }
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "loan_product.documents_updated",
      entityType: "loan_product",
      entityId: productId,
      before: { documents: before.map((d) => ({ category: d.category, isRequired: d.isRequired })) },
      after: { documents: parsed.data.map((d) => ({ category: d.category, isRequired: d.isRequired })) },
    });
  });
}
