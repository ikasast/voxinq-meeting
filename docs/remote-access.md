# Remote access (record & view from a phone)

To use Voxinq Meeting from a phone or another device, that device's browser must reach two
things on the host **over TLS**:

1. the **web app** (port 3000) over HTTPS, and
2. the **STT service** (port 8000) over WSS — the browser streams audio to it directly.

Two extra rules follow from the browser security model:

- **Recording needs a secure context (HTTPS).** `getUserMedia` (microphone), Wake Lock and
  PWA install only work over `https://` (or `localhost`). Plain `http://<private-ip>` is
  **not** a secure context, so the mic is blocked.
- **The STT service has no authentication of its own** — it only restricts browser origins
  (see [Configuration → `STT_ALLOWED_ORIGINS`](configuration.md)). So it must never be
  exposed to the public internet without an auth layer in front of it.

There are two families of solutions:

| Family | Examples | Model |
| --- | --- | --- |
| **Private tunnel** | Tailscale, WireGuard | Only your own devices can reach the host; STT stays hidden from the internet |
| **Public URL** | Cloudflare Tunnel, reverse proxy + domain | Reachable from any browser; **you must add authentication**, especially for STT |

---

## A. Tailscale (easiest)

[Tailscale](https://tailscale.com) is managed WireGuard. It gives you, automatically, the
three things recording needs: a valid HTTPS certificate (`*.ts.net`), TLS exposure of both
ports, and an identity header the app trusts.

```bash
tailscale serve --bg --https=443 localhost:3000     # web
tailscale serve --bg --https=8443 localhost:8000    # STT (wss)
```

Your address is `<host>.<tailnet>.ts.net`: `tailscale status` prints the host on its first
line, and the tailnet name is at the top of the
[admin console](https://login.tailscale.com/admin/machines). **MagicDNS and HTTPS Certificates
must be enabled** in the console's [DNS](https://login.tailscale.com/admin/dns) page, or
`--https` cannot get a certificate. `tailscale serve status` confirms the result.

Then point the app at the STT address, which differs by install:

| Install | Variable | Applied by |
| --- | --- | --- |
| **Docker** | `STT_WS_URL=wss://<host>.<tailnet>.ts.net:8443/ws` | `docker compose up -d` — read at request time, **no rebuild** |
| **Native** | `NEXT_PUBLIC_STT_WS_URL=wss://<host>.<tailnet>.ts.net:8443/ws` | **`npm run build`** — compiled into the browser bundle |

Optionally set `APP_PASSWORD` for login on public/Funnel access. See
[Configuration](configuration.md).

> Requests that arrive through `tailscale serve` carry a `Tailscale-User-Login` header, which
> the app treats as "internal" (recording enabled). Any other path is treated as external
> (view-only). A public reverse proxy must therefore **strip that header** to prevent spoofing.

### Step by step, including the phone

**1. Install Tailscale on the host and on the phone**, then sign both into the same account:

```bash
tailscale up
```

**2. Find your host's name.** This is the part the `STT_WS_URL` placeholder cannot tell you.
Your machine's full name is `<host>.<tailnet>.ts.net`, and `tailscale status` prints it — your
own machine is the first line:

```bash
tailscale status
```

```
100.88.208.114  myhost   tagged-devices  linux  -
```

Combine that with your tailnet name, shown at the top of the
[admin console](https://login.tailscale.com/admin/machines) (something like `tail1a2b3c.ts.net`
unless you renamed it), giving `myhost.tail1a2b3c.ts.net`. Hovering a machine in the admin
console also copies the full name directly.

**3. Enable MagicDNS and HTTPS certificates.** Both live in the admin console under
[DNS](https://login.tailscale.com/admin/dns) and both are required — `tailscale serve --https`
cannot issue a certificate without them.

**4. Publish the two ports:**

```bash
tailscale serve --bg --https=443 localhost:3000    # the web app
tailscale serve --bg --https=8443 localhost:8000   # the STT service (wss)
```

Verify:

```bash
tailscale serve status
```

```
https://myhost.tail1a2b3c.ts.net (tailnet only)
|-- / proxy http://localhost:3000

https://myhost.tail1a2b3c.ts.net:8443 (tailnet only)
|-- / proxy http://localhost:8000
```

**5. Point the app at the STT address the phone will use** — the `:8443` one, with the `wss://`
scheme and the `/ws` path:

```bash
STT_WS_URL=wss://myhost.tail1a2b3c.ts.net:8443/ws
```

```bash
docker compose up -d
```

> **Docker reads this at request time**, so a restart is enough — no rebuild. On a **native**
> install the equivalent is `NEXT_PUBLIC_STT_WS_URL`, which is compiled into the JavaScript
> bundle at build time and therefore needs `npm run build` again after any change.

**6. On the phone**, open `https://myhost.tail1a2b3c.ts.net` and install it: the header carries
a **downward-arrow icon** (no label — it reads as "Install app" to a screen reader), and on iOS
Safari that icon explains **Add to Home Screen** instead. The app is a PWA and runs full-screen
from there. The icon is absent where the browser cannot install, and once it already has.

If the page loads but recording fails, the STT service is rejecting the browser's origin. It
allows `localhost`, private LAN ranges and `*.ts.net` automatically; if you set
`STT_ALLOWED_ORIGINS` yourself, your web address has to be in that list. See
[Troubleshooting](troubleshooting.md).

### Read-only public sharing (view & download from anywhere)

To let a computer **outside** your tailnet — e.g. a locked-down work PC that cannot install
Tailscale — read and download minutes, expose the web app with **Tailscale Funnel** and set a
password. The STT service stays private, so recording is impossible from outside; and the app
enforces **read-only** access for any request without a tailnet identity.

```bash
# Public HTTPS for the web app only (never Funnel the STT port).
tailscale funnel --bg --https=443 localhost:3000   # publish
tailscale serve  --bg --https=443 localhost:3000   # unpublish (keep tailnet access)
```

> To go private, re-assert `serve` (as above) rather than `tailscale funnel --https=443 off`:
> the `off` form removes the `:443` handler entirely, which would 404 the app even inside your
> tailnet. `serve` keeps the same proxy and only drops the public flag.

> **Toggle it from inside the app.** Once `APP_PASSWORD` is set, a tailnet-connected device can
> turn public access on/off under **Settings → Remote access** (it runs the commands above for
> you and shows the public URL). The toggle is refused for outside visitors, so a public viewer
> can never publish or unpublish. Set `TAILSCALE_BIN` / `TAILSCALE_FUNNEL_PORT` /
> `TAILSCALE_FUNNEL_TARGET` if your paths or ports differ from the defaults.

Set `APP_PASSWORD` (and a strong `APP_SESSION_SECRET`) in `.env`, then restart the app
(`docker compose up -d`, or `npm run build && npm start` natively — these are read on the
server, so Docker needs no rebuild). What outside visitors get after logging in with the
password:

- ✅ view meetings, minutes and transcripts; download minutes / transcript / meeting info.
- ❌ everything that changes state — recording, minutes generation, editing, diarization,
  delete, archive, settings — is **refused server-side** (HTTP 403), not just hidden. So even
  the password holder on an untrusted machine cannot trigger those.

This is safe to combine with the phone-over-Tailscale setup: tailnet devices keep full access
(the identity header marks them internal), only Funnel visitors are read-only. Because Funnel
requests never carry the `Tailscale-User-Login` header — and Tailscale controls that header —
the internal/external boundary cannot be forged.

> ⚠️ **Never Funnel the STT port (8000/8443).** It has no authentication; Funnel would put your
> recordings and GPU on the public internet. Only the web app (3000) should be Funnelled.

---

## B. WireGuard (self-hosted, no Tailscale)

[WireGuard](https://www.wireguard.com/) is the VPN Tailscale is built on, and it ships in the
Linux kernel. You get the same privacy model (only your devices reach the host), fully
self-hosted, but **you provide manually what Tailscale did for free**:

| What recording needs | Tailscale gave you | With plain WireGuard you must… |
| --- | --- | --- |
| Reach the STT service (:8000) | `tailscale serve :8443` | tunnel/expose :8000 yourself |
| HTTPS certificate | free `*.ts.net` cert | issue your own cert (below) |
| "Internal" detection (recording UI) | `Tailscale-User-Login` header | set `NETWORK_MODE=lan` |

Because of that, pick the tier that matches your need.

### Set up the tunnel (both tiers need this)

**Where to run the WireGuard server**

- **A machine with a public IP** (e.g. a VPS) — no router changes needed.
- **A home/office machine** — forward a UDP port (default `51820`) on the router to it, and
  use a dynamic-DNS name if your home IP changes.

**Server (Linux)**

```bash
sudo apt install wireguard              # Debian/Ubuntu
wg genkey | tee server.key | wg pubkey > server.pub    # keys (repeat for each client)

sudo tee /etc/wireguard/wg0.conf >/dev/null <<'EOF'
[Interface]
Address = 10.9.0.1/24
ListenPort = 51820
PrivateKey = <server.key contents>

[Peer]                                   # one block per device
PublicKey = <phone public key>
AllowedIPs = 10.9.0.2/32
EOF

sudo sysctl -w net.ipv4.ip_forward=1     # persist in /etc/sysctl.conf
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0       # start on boot
```

**Phone** — install the official WireGuard app and add a tunnel (generating a QR code on the
server with `qrencode` from the client config is the easiest way to import it):

```ini
[Interface]
PrivateKey = <phone private key>
Address = 10.9.0.2/32

[Peer]
PublicKey = <server.pub contents>
Endpoint = <server public IP or DDNS name>:51820
AllowedIPs = 10.9.0.1/32       # route only the host, not all traffic
```

### Tier 1 — view only (simplest, safest)

Do nothing more. With the tunnel up, open **`http://10.9.0.1:3000`** on the phone.

- The STT service (:8000) stays private — it is not exposed at all.
- The app sees no `Tailscale-User-Login` header, so it runs in **view-only mode**: you can
  read minutes and transcripts, but the recording UI is disabled. (Recording is still done
  at home/office over `localhost`/LAN.)
- If `APP_PASSWORD` is set, you log in as usual.

Plain HTTP is fine here because viewing needs no secure context.

### Tier 2 — recording too

Recording needs HTTPS, so put **[Caddy](https://caddyserver.com/)** in front to serve both
services over TLS using its built-in local CA, then trust that CA on each device.

```caddyfile
# Caddyfile — HTTPS via Caddy's internal CA (no public domain needed)
https://10.9.0.1 {
    tls internal
    reverse_proxy localhost:3000
}
https://10.9.0.1:8443 {
    tls internal
    reverse_proxy localhost:8000
}
```

Then:

1. **Trust Caddy's root CA on every device.** Export it (`caddy trust`, or copy
   `~/.local/share/caddy/pki/authorities/local/root.crt`) and install it on the phone
   (Android: *Settings → Security → Install a certificate → CA certificate*; iOS: install the
   profile, then enable it under *Settings → General → About → Certificate Trust Settings*).
2. **Rebuild** with the STT URL pointing at the HTTPS endpoint (baked in at build time):
   ```
   NEXT_PUBLIC_STT_WS_URL="wss://10.9.0.1:8443/ws"
   ```
3. **Enable the recording UI over the tunnel** by setting `NETWORK_MODE=lan` (the tunnel is
   already your trust boundary, so every reachable client is treated as internal). See
   [Configuration](configuration.md).

Now `https://10.9.0.1` on the phone can record end to end.

> WireGuard does not automate NAT traversal, dynamic DNS, key distribution or name
> resolution — Tailscale does all of that for you. If that manual work is unappealing but you
> still want a self-hosted VPN, Tailscale is the pragmatic choice; WireGuard is for when you
> want zero third-party coordination.

---

## C. Public URL (reachable from any browser)

If you would rather not run a VPN client on each device, expose a public HTTPS URL — but
remember the STT service has **no authentication**, so you must add one at the edge.

- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  + Cloudflare Access** — a `cloudflared` daemon on the host opens an outbound tunnel, so you
  get a public HTTPS hostname with **no port forwarding and no static IP**. Cloudflare Access
  puts login (Google/e-mail OTP, etc.) in front of everything, which conveniently protects the
  auth-less STT service. Easiest "safe from anywhere" option; Cloudflare sits in the path.
- **Your own domain + reverse proxy** (Caddy/nginx + Let's Encrypt) — fully self-hosted, but
  you must enforce authentication in front of **both** the web app and the STT routes
  yourself, and open a port / use dynamic DNS.

Whichever you pick, point `NEXT_PUBLIC_STT_WS_URL` at the public STT URL before building, and
never leave the STT service reachable without an auth layer.

---

## Which should I use?

| Approach | You set up | Difficulty | Phone recording | Third party |
| --- | --- | --- | --- | --- |
| **Tailscale** | almost nothing | ★ easiest | ✅ works out of the box | Tailscale |
| **WireGuard — view only** | tunnel + router | ★★ | ❌ (view only) | none |
| **WireGuard — with recording** | tunnel + Caddy/TLS + CA on devices | ★★★ | ✅ after setup | none |
| **Cloudflare Tunnel + Access** | `cloudflared` + Access policy | ★★ | ✅ (needs HTTPS-aware config) | Cloudflare |
| **Domain + reverse proxy** | domain + proxy + auth | ★★★ | ✅ after setup | none |

- Want it to "just work" → **Tailscale**.
- Want no third party, and only need to read minutes on the go → **WireGuard, view only**.
- Want no third party and full recording → **WireGuard with Caddy**, accepting the extra setup.

---

[Docs index](README.md) · [← Setup](setup.md) · Next: [Configuration →](configuration.md)
