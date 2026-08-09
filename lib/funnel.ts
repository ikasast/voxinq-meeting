import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

// Drive `tailscale funnel` to publish / unpublish the web app.
//
// The web server runs on the primary host right next to tailscaled, so it can
// toggle its own public exposure. This ONLY ever touches the web port (443):
// the STT (8443) and PostgreSQL (5432) serve mappings are never funnelled here.
// Callers must gate this to internal (tailnet) requests — see the API route and
// proxy.ts read-only guard; nothing in here re-checks the caller.

const execFileP = promisify(execFile);

// Overridable for non-default setups. Defaults match the documented topology.
const HTTPS_PORT = process.env.TAILSCALE_FUNNEL_PORT ?? "443";
const WEB_TARGET = process.env.TAILSCALE_FUNNEL_TARGET ?? `localhost:${process.env.PORT ?? "3000"}`;
const TIMEOUT = 15_000;

export type FunnelState = {
  available: boolean; // tailscale CLI reachable on this host
  public: boolean | null; // is the web port funnelled to the internet
  hostname: string | null; // e.g. host.tailnet.ts.net
  url: string | null; // public URL when known
};

// Resolve the tailscale binary: explicit override, then the OS default install
// path, then bare "tailscale" on PATH.
function tailscaleBin(): string {
  const candidates = [
    process.env.TAILSCALE_BIN,
    process.platform === "win32"
      ? "C:\\Program Files\\Tailscale\\tailscale.exe"
      : "/usr/bin/tailscale",
    "/usr/local/bin/tailscale",
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "tailscale"; // rely on PATH
}

async function run(bin: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP(bin, args, { timeout: TIMEOUT, windowsHide: true });
  return stdout;
}

// This host's own MagicDNS name (without the trailing dot), used to build the
// public URL and to look up the funnel flag regardless of on/off state.
async function selfDnsName(bin: string): Promise<string> {
  try {
    const j = JSON.parse(await run(bin, ["status", "--json"]));
    const dns: string = j?.Self?.DNSName ?? "";
    return dns.replace(/\.$/, "");
  } catch {
    return "";
  }
}

export async function getFunnelState(): Promise<FunnelState> {
  const bin = tailscaleBin();
  try {
    const hostname = await selfDnsName(bin);
    const j = JSON.parse(await run(bin, ["funnel", "status", "--json"]));
    const allow: Record<string, boolean> = j?.AllowFunnel ?? {};
    const isPublic = hostname
      ? allow[`${hostname}:${HTTPS_PORT}`] === true
      : Object.entries(allow).some(([k, v]) => v === true && k.endsWith(`:${HTTPS_PORT}`));
    return {
      available: true,
      public: isPublic,
      hostname: hostname || null,
      url: hostname ? `https://${hostname}/` : null,
    };
  } catch {
    return { available: false, public: null, hostname: null, url: null };
  }
}

// Publish (on) or unpublish (off) the web port. Returns the resulting state.
//
// Going private re-asserts a tailnet-only `serve` (not `funnel ... off`): the
// latter tears down the :443 handler entirely, which would 404 the app even on
// the tailnet. `serve` keeps the same proxy but drops the public funnel flag.
export async function setFunnelPublic(on: boolean): Promise<FunnelState> {
  const bin = tailscaleBin();
  const verb = on ? "funnel" : "serve";
  await run(bin, [verb, "--bg", "--yes", `--https=${HTTPS_PORT}`, WEB_TARGET]);
  return getFunnelState();
}
