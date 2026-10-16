import { describe, expect, it } from "vitest";
import { isRecording, statusText } from "@/app/recording-status";
import { QUICK_RETRIES, reconnectDelay } from "@/lib/stt/client";

describe("a recording the transcription service has stopped answering", () => {
  it("is still a recording", () => {
    expect(isRecording("local")).toBe(true);
    expect(isRecording("reconnecting")).toBe(true);
    expect(isRecording("error")).toBe(false);
    expect(isRecording("closed")).toBe(false);
    expect(statusText((k) => k, "local")).toBe("Recording on this device");
  });

  it("tries quickly at first, then every thirty seconds, for ever", () => {
    for (let n = 1; n <= QUICK_RETRIES; n++) expect(reconnectDelay(n)).toBe(2000);
    expect(reconnectDelay(QUICK_RETRIES + 1)).toBe(4000);
    expect(reconnectDelay(QUICK_RETRIES + 2)).toBe(8000);
    expect(reconnectDelay(QUICK_RETRIES + 4)).toBe(30_000);
    expect(reconnectDelay(500)).toBe(30_000);
  });
});
