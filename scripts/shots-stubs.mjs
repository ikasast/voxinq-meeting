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

const STT_PORT = Number(process.env.SHOTS_STT_PORT ?? 8103);
const LLM_PORT = Number(process.env.SHOTS_LLM_PORT ?? 11435);

function serve(port, answer) {
  http
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
});

serve(LLM_PORT, (_method, path) => {
  if (path === "/api/version") return { version: "0.12.3" };
  if (path === "/api/tags") {
    return { models: [{ name: "qwen2.5:7b-instruct", model: "qwen2.5:7b-instruct", size: 4_683_087_332 }] };
  }
  if (path === "/api/ps") return { models: [] };
  return {};
});
