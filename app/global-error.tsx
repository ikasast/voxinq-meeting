"use client";

import { ServerTrouble } from "./server-trouble";

// The root layout itself failed — with the database down it does, since it asks who you are — so
// this replaces it, document and all (server-trouble.tsx).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      {/* The app's stylesheet may or may not be on this page; its background where it is. */}
      <body style={{ margin: 0, minHeight: "100vh", background: "var(--background, Canvas)", colorScheme: "light dark" }}>
        <title>Voxinq Meeting</title>
        <ServerTrouble digest={error.digest} />
      </body>
    </html>
  );
}
