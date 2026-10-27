"use client";

/** Last-resort error boundary (replaces the root layout). Shows no error details beyond the digest. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f9fb", color: "#16263a" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>TrustLend is temporarily unavailable</h1>
          <p style={{ color: "#516174", maxWidth: 420 }}>Please try again in a moment.</p>
          {error.digest ? <p style={{ fontFamily: "monospace", fontSize: 12, color: "#516174" }}>Reference: {error.digest}</p> : null}
          <button
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#123a52", color: "white", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
