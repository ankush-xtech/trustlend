import { requirePagePermission } from "@/server/auth/current";
import { PageHeader } from "@/components/shared/display";
import { EMPTY_PRODUCT, ProductEditor } from "@/components/admin/product-editor";

export const metadata = { title: "New loan product" };

export default async function NewProductPage() {
  await requirePagePermission("admin", "loan_products.manage");
  return (
    <>
      <PageHeader
        title="New loan product"
        breadcrumb={{ href: "/admin/products", label: "Loan products" }}
        description="Create the product first, then configure its document requirements. New products start inactive until you activate them."
      />
      <ProductEditor productId={null} initial={EMPTY_PRODUCT} />
    </>
  );
}
