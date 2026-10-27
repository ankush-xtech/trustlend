"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Details are logged on the server; only the digest is shown to the user.
    console.error("Unhandled UI error", error.digest ?? "");
  }, [error]);

  return (
    <main id="main" className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <AlertTriangleIcon className="size-10 text-warning" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-muted-foreground">We couldn&apos;t complete that request. Please try again. If the problem continues, contact support.</p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to homepage
        </Link>
      </div>
    </main>
  );
}
