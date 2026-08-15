import { describe, expect, it } from "vitest";
import { mergeLiveTranscripts, type LiveItem, type ServerSnapshot } from "../lib/live-merge";

function item(id: string, text: string, extra: Partial<LiveItem> = {}): LiveItem {
  return {
    id,
    text,
    speakerType: "self",
    createdAt: `2026-08-15T10:00:0${id}.000Z`,
    translation: null,
    ...extra,
  };
}

function snapshot(items: LiveItem[]): ServerSnapshot {
  return new Map(
    items.map((t) => [
      t.id,
      { text: t.text, speakerType: t.speakerType, translation: t.translation ?? null },
    ]),
  );
}

describe("mergeLiveTranscripts", () => {
  it("appends utterances the recorder has since saved", () => {
    const local = [item("1", "hello")];
    const incoming = [item("1", "hello"), item("2", "world")];

    const { next } = mergeLiveTranscripts(local, snapshot(local), incoming);

    expect(next.map((t) => t.text)).toEqual(["hello", "world"]);
  });

  it("keeps a local edit instead of reverting it to a stale server value", () => {
    const server = [item("1", "meeting with Acme")];
    const local = [item("1", "meeting with ACME Corp")]; // corrected here, PATCH in flight

    const { next } = mergeLiveTranscripts(local, snapshot(server), incomingSame(server));

    expect(next[0].text).toBe("meeting with ACME Corp");
  });

  it("adopts the server value once it matches what this client sent", () => {
    const base = [item("1", "meeting with Acme")];
    const local = [item("1", "meeting with ACME Corp")];
    const incoming = [item("1", "meeting with ACME Corp")]; // PATCH landed

    const { next, snapshot: snap } = mergeLiveTranscripts(local, snapshot(base), incoming);

    expect(next[0].text).toBe("meeting with ACME Corp");
    // The new base is the server's view, so the next poll compares against this.
    expect(snap.get("1")?.text).toBe("meeting with ACME Corp");
  });

  it("picks up a translation that arrives later for an existing row", () => {
    const server = [item("1", "good morning")];
    const local = [item("1", "good morning")];
    const incoming = [item("1", "good morning", { translation: "おはようございます" })];

    const { next } = mergeLiveTranscripts(local, snapshot(server), incoming);

    expect(next[0].translation).toBe("おはようございます");
  });

  it("adopts a speaker reassignment made on the recording device", () => {
    const server = [item("1", "hello")];
    const local = [item("1", "hello")];
    const incoming = [item("1", "hello", { speakerType: "partner-1" })];

    const { next } = mergeLiveTranscripts(local, snapshot(server), incoming);

    expect(next[0].speakerType).toBe("partner-1");
  });

  it("drops a row deleted on the recording device", () => {
    const server = [item("1", "hello"), item("2", "oops")];
    const local = [item("1", "hello"), item("2", "oops")];
    const incoming = [item("1", "hello")];

    const { next } = mergeLiveTranscripts(local, snapshot(server), incoming);

    expect(next.map((t) => t.id)).toEqual(["1"]);
  });

  it("keeps a row this client edited even when the server no longer has it", () => {
    const server = [item("1", "hello"), item("2", "raw text")];
    const local = [item("1", "hello"), item("2", "edited text")];
    const incoming = [item("1", "hello")];

    const { next } = mergeLiveTranscripts(local, snapshot(server), incoming);

    expect(next.map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("keeps local values on the first poll, when there is no base to compare against", () => {
    const local = [item("1", "edited before the first poll")];
    const incoming = [item("1", "original")];

    const { next } = mergeLiveTranscripts(local, new Map(), incoming);

    expect(next[0].text).toBe("edited before the first poll");
  });

  it("orders by createdAt, falling back to id within the same millisecond", () => {
    const at = "2026-08-15T10:00:00.000Z";
    const incoming = [
      item("c", "third", { createdAt: at }),
      item("a", "first", { createdAt: at }),
      item("b", "second", { createdAt: at }),
    ];

    const { next } = mergeLiveTranscripts([], new Map(), incoming);

    expect(next.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

/** The server returning exactly what the snapshot was taken from. */
function incomingSame(server: LiveItem[]): LiveItem[] {
  return server.map((t) => ({ ...t }));
}
