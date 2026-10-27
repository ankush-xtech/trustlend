import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/auth/current";
import { getProductAdmin } from "@/server/services/products";
import { IllustrativeNotice, PageHeader, Section, ToneBadge } from "@/components/shared/display";
import { ProductEditor } from "@/components/admin/product-editor";
import { ProductDocumentsEditor } from "@/components/admin/product-documents-editor";
import { isUuid, orNotFound } from "@/components/admin/server-utils";

export const metadata = { title: "Loan product" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePagePermission("admin", "loan_products.manage", "loan_products.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { product, documents } = await orNotFound(getProductAdmin(actor, id));
  const readOnly = !actor.permissions.has("loan_products.manage");
  return (
    <>
      <PageHeader
        title={product.name}
        breadcrumb={{ href: "/admin/products", label: "Loan products" }}
        description={readOnly ? "Read-only view. You need loan_products.manage to make changes." : "Changes apply to new applications and to drafts when they are next saved or submitted."}
        actions={<ToneBadge tone={product.isActive ? "success" : "neutral"}>{product.isActive ? "Active" : "Inactive"}</ToneBadge>}
      />
      {product.isIllustrative ? (
        <div className="mb-4">
          <IllustrativeNotice>This is an illustrative demo product created by the seed script. Review all content before using it in production.</IllustrativeNotice>
        </div>
      ) : null}
      <div className="grid gap-6">
        <ProductEditor
          productId={product.id}
          readOnly={readOnly}
          initial={{
            code: product.code,
            slug: product.slug,
            name: product.name,
            shortDescription: product.shortDescription,
            description: product.description,
            referencePrefix: product.referencePrefix,
            minAmount: product.minAmount,
            maxAmount: product.maxAmount,
            isActive: product.isActive,
            config: product.config,
          }}
        />
        <Section title="Document requirements (wizard step 5)" description="Required documents must be uploaded before submission and verified before documentation can be completed.">
          <ProductDocumentsEditor
            productId={product.id}
            readOnly={readOnly}
            initial={documents.map((d) => ({
              category: d.category,
              label: d.label,
              description: d.description,
              isRequired: d.isRequired,
              applicantTypes: d.applicantTypes ?? [],
            }))}
          />
        </Section>
      </div>
    </>
  );
}
