"use client";

import { ServerTrouble } from "./server-trouble";

// A page that failed on the server, inside the app's own layout (server-trouble.tsx).
export default function Error({ error }: { error: Error & { digest?: string } }) {
  return <ServerTrouble digest={error.digest} />;
}
