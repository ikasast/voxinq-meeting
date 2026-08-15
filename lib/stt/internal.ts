// Where the web *server* reaches the STT service, as opposed to lib/stt/client.ts, which is
// the address the *browser* uses.
//
// 127.0.0.1 rather than localhost on purpose. The STT service binds IPv4, but `localhost`
// resolves to ::1 first on Windows — so any other process holding IPv6 :8000 (a container
// publishing the same port, say) silently answers instead, and the request quietly reaches the
// wrong server. Compose sets this to http://stt:8000.
export function sttInternalUrl(): string {
  return process.env.STT_INTERNAL_URL ?? "http://127.0.0.1:8000";
}
