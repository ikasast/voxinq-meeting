// Picking ports, and being sure a port is really free before handing it to a service.

import { createServer, createConnection } from "node:net";

/** Can a server bind this port on the wildcard address? */
function canBind(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

/** Does something answer a TCP connection here? */
function answers(port, host = "127.0.0.1", timeout = 400) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/**
 * Is this port genuinely unused?
 *
 * Both checks are needed, and one of them was learned the hard way. Binding alone is not
 * enough: Windows lets a socket take `127.0.0.1:8000` while another already holds
 * `0.0.0.0:8000`, so a naive bind test reported a port free that a running service owned --
 * and the new process then shadowed the old one for every local client, silently, which is the
 * worst shape a bug can have. Connecting alone is not enough either: a port can be reserved or
 * held by a socket in a state that refuses connections but still blocks binding.
 */
export async function portFree(port) {
  if (await answers(port)) return false;
  return canBind(port);
}

/**
 * The first free port at or after `preferred`.
 *
 * Ports are chosen at run time rather than fixed, because a launcher that refuses to start over
 * a port clash is a launcher someone has to debug. The web app learns the STT port through
 * STT_WS_URL, which it reads per request -- so nothing has to be rebuilt when this lands
 * somewhere other than 8000.
 */
export async function pickPort(preferred, limit = 40) {
  for (let port = preferred; port < preferred + limit; port++) {
    if (await portFree(port)) return port;
  }
  throw new Error(`No free port between ${preferred} and ${preferred + limit}`);
}

/** Does an HTTP endpoint answer, within `timeoutMs`? Used to wait for a service to come up. */
export async function waitForHttp(url, { timeoutMs = 120000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      // Any answer means the server is up; 401 is what an app with a password set returns.
      if (res.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
