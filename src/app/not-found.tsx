import Link from "next/link";
import { BrandMark } from "@/components/layout/brand";
import { LinkButton } from "@/components/shared/display";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 text-center">
      <Link href="/" aria-label="TrustLend home">
        <BrandMark />
      </Link>
      <p className="mt-10 text-sm font-semibold uppercase tracking-wider text-brand">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you are looking for does not exist, or you do not have access to it.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LinkButton href="/">Go to homepage</LinkButton>
        <LinkButton href="/login" variant="outline">
          Sign in
        </LinkButton>
      </div>
    </main>
  );
}
