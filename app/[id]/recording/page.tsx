import { redirect } from "next/navigation";

// The recording screen is the meeting's own page since v4 (../recording-dock.tsx). The address
// stays because links, bookmarks and the Android app's notification still open it; whatever it
// was asked (?autostart=1, ?resume=1, the per-recording model, mic and source) goes with it.
export default async function RecordingAddress({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const qs = query.toString();
  redirect(`/${id}${qs ? `?${qs}` : ""}`);
}
