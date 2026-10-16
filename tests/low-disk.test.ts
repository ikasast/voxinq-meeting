import { describe, expect, it } from "vitest";
import { lowDisk, LOW_DISK_BYTES } from "@/app/health-status";

describe("room left where recordings are kept", () => {
  it("says nothing while there is enough, or when the service does not say", () => {
    expect(lowDisk(LOW_DISK_BYTES)).toBeNull();
    expect(lowDisk(200 * 1024 ** 3)).toBeNull();
    expect(lowDisk(undefined)).toBeNull();
    expect(lowDisk(Number.NaN)).toBeNull();
  });

  it("says how much is left, and how many hours of recording that is", () => {
    // 16 kHz mono 16-bit: 115.2 MB an hour.
    expect(lowDisk(4.1 * 1024 ** 3)).toEqual({ gb: "4.1", hours: 38 });
    expect(lowDisk(50 * 1024 ** 2)).toEqual({ gb: "0.0", hours: 0 });
  });
});
