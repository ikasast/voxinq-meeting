// Stand-ins for the transcription service and Ollama while the README is photographed.
//
//   node scripts/shots-stubs.mjs      # STT on 8103, Ollama on 11435 (SHOTS_STT_PORT / SHOTS_LLM_PORT)
//
// The screenshots show the app's status bar and the meeting page, and both ask these two
// services how they are. A bare stub photographs its own fallback — "Cannot reach Ollama" in red
// across the top, and no **Resume recording** because nothing said a recording was kept — so
// these answer as a working install would: an NVIDIA host with the default model loaded, and
// Ollama up with the default model pulled. Nothing here recognises or writes anything.
//
// See docs/screenshots/README.md for the whole recipe.
import http from "node:http";
import { createHash } from "node:crypto";

const STT_PORT = Number(process.env.SHOTS_STT_PORT ?? 8103);
const LLM_PORT = Number(process.env.SHOTS_LLM_PORT ?? 11435);

// Just enough of a WebSocket for the recording screen to believe it is recording: the
// handshake, then "open" once the page has said how it wants to record. What it sends after that
// (audio) is read and dropped, and nothing is ever recognised, so no line is added.
function socket(req, sock) {
  const key = req.headers["sec-websocket-key"];
  if (!key) return sock.destroy();
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  sock.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const text = (s) => {
    const body = Buffer.from(s);
    sock.write(Buffer.concat([Buffer.from([0x81, body.length]), body])); // short frames only
  };
  let opened = false;
  sock.on("data", () => {
    if (opened) return;
    opened = true;
    text(JSON.stringify({ type: "status", status: "open" }));
  });
  sock.on("error", () => {});
}

function serve(port, answer, upgrade) {
  const server = http
    .createServer((req, res) => {
      // The page calls the transcription service from the browser, so it needs CORS.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      req.resume();
      req.on("end", () => {
        const path = new URL(req.url, "http://stub").pathname;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(answer(req.method, path)));
      });
    })
    .listen(port, "127.0.0.1", () => console.log(`listening on ${port}`));
  if (upgrade) server.on("upgrade", upgrade);
}

serve(STT_PORT, (method, path) => {
  if (path === "/health") {
    return {
      status: "ok",
      model: "large-v3-turbo",
      backend: "faster-whisper",
      device: "cuda",
      compute: "int8_float16",
      loaded: "large-v3-turbo",
      busy: false,
      busyKind: null,
      liveTranscription: true,
      diarizationBackend: "pyannote",
      vramTotalMb: 8192,
      vramFreeMb: 3900,
    };
  }
  // Every demo meeting's recording is still kept, as it would be inside the retention window.
  const one = path.match(/^\/recordings\/([^/]+)$/);
  if (one && one[1] !== "states" && method === "GET") {
    return { exists: true, protected: false, durationSec: 1320, sizeBytes: 42_240_000, segments: [] };
  }
  return {};
}, socket);

serve(LLM_PORT, (_method, path) => {
  if (path === "/api/version") return { version: "0.12.3" };
  if (path === "/api/tags") {
    return { models: [{ name: "qwen3:8b", model: "qwen3:8b", size: 5_225_374_496 }] };
  }
  if (path === "/api/ps") return { models: [] };
  return {};
});
