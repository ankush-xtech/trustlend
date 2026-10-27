import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { requirePagePermission } from "@/server/auth/current";
import { listProductsAdmin } from "@/server/services/products";
import { EmptyState, LinkButton, PageHeader, ToneBadge } from "@/components/shared/display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Loan products" };

export default async function ProductsPage() {
  const actor = await requirePagePermission("admin", "loan_products.manage", "loan_products.read");
  const products = await listProductsAdmin(actor);
  return (
    <>
      <PageHeader
        title="Loan products"
        description="Only active products accept new applications. Requested amounts are never treated as approved amounts."
        actions={actor.permissions.has("loan_products.manage") ? <LinkButton href="/admin/products/new"><PlusIcon /> New product</LinkButton> : null}
      />
      {products.length === 0 ? (
        <EmptyState title="No loan products yet" />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount range</TableHead>
                <TableHead className="text-right">Document requirements</TableHead>
                <TableHead className="text-right">Applications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    <div className="text-xs text-muted-foreground"><code>{p.code}</code> · /{p.slug}{p.isIllustrative ? " · illustrative demo" : ""}</div>
                  </TableCell>
                  <TableCell><ToneBadge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Inactive"}</ToneBadge></TableCell>
                  <TableCell className="text-sm">{formatMoney(p.minAmount, p.currency)} – {formatMoney(p.maxAmount, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.documentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.applicationCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
