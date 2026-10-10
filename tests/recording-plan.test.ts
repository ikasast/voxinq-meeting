import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordingPlan, type RecordingPlanInput } from "../lib/recording/plan";

// A recording started from a notice — the phone's lock screen, or a watch — has no page to work
// out its settings and nobody to ask about the GPU. It gets the page's answers, from the server,
// and records only rather than taking the card from running work.

const input = (over: Partial<RecordingPlanInput> = {}): RecordingPlanInput => ({
  meeting: { title: "Invented weekly", whisperModel: null, sttLanguage: null },
  settings: {
    whisperModel: "large-v3-turbo",
    sttLanguage: "ja",
    sttGlossary: "Invented Corp",
    sttTranslate: false,
  },
  seriesGlossary: "Invented Project",
  wsUrl: "wss://host.example.ts.net:8443/ws",
  deferredHost: false,
  contended: false,
  ...over,
});

describe("a recording started without a page", () => {
  it("uses what the meeting was set up with, then the settings", () => {
    const plan = recordingPlan(input({ meeting: { title: "t", whisperModel: "medium", sttLanguage: "en" } }));
    expect(plan.model).toBe("medium");
    expect(plan.language).toBe("en");
    expect(recordingPlan(input()).model).toBe("large-v3-turbo");
    expect(recordingPlan(input()).language).toBe("ja");
  });

  it("primes recognition with the host's terms and the series' own, as the page does", () => {
    expect(recordingPlan(input()).initialPrompt).toBe("Invented Corp、Invented Project");
    expect(recordingPlan(input()).micMode).toBe("room");
  });

  it("takes the card when nothing else wants it", () => {
    const plan = recordingPlan(input());
    expect(plan.reserve).toBe(true);
    expect("liveTranscript" in plan).toBe(false);
  });

  it("records only, and reserves nothing, when something else is using the card", () => {
    const plan = recordingPlan(input({ contended: true }));
    expect(plan).toMatchObject({ liveTranscript: false, recordOnly: true, reserve: false });
  });

  it("records without live text on a host that transcribes at the end", () => {
    const plan = recordingPlan(input({ deferredHost: true, contended: true }));
    expect(plan).toMatchObject({ liveTranscript: false, recordOnly: false, reserve: false });
  });
});

describe("the route", () => {
  const route = readFileSync(join(__dirname, "..", "app/api/meetings/[id]/record/route.ts"), "utf8");

  it("refuses from outside the private network, and for a meeting that has ended", () => {
    expect(route).toContain("isExternalRequest()");
    expect(route).toContain("meeting.endedAt");
  });

  it("reserves the card only when the plan says to", () => {
    expect(route).toContain("if (plan.reserve) await reserveForRecording(meeting.id, plan.model);");
  });
});
