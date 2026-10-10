// Shared icons (Lucide-style 24x24 stroke SVGs). currentColor lets the button control the color.
import type { SVGProps } from "react";

function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Base>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Base>
);

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Base>
);

export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Base>
);

export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
  </Base>
);

export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Base>
);

export const RefreshIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </Base>
);

/** A padlock, shut: a recording that is kept. */
export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    <path d="M12 15v2" />
  </Base>
);

/** The same padlock, open: a recording that goes when its time is up. */
export const LockOpenIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.75-1.4" />
    <path d="M12 15v2" />
  </Base>
);

export const ScissorsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M8.12 8.12 20 20" />
    <path d="M8.12 15.88 20 4" />
  </Base>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);


export const RestoreIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Base>
);

export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 18v4M8 22h8" />
  </Base>
);

export const PlusCircleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Base>
);

export const DotsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Base>
);


// A stack of meeting cards — the list, as the rail's own icon for it.
// Meetings and Series are Tabler Icons' `messages` and `folders` (MIT, © Paweł Kuna,
// https://tabler.io/icons). A meeting is a conversation; a series is where the meetings that
// keep happening are kept together. The two bars and the ↻ they replace said neither — the ↻
// said "repeats", which is a property of a series rather than what one is.
export const MeetingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
    aria-hidden
    {...p}
  >
    <path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" />
    <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
  </svg>
);

export const SeriesIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
    aria-hidden
    {...p}
  >
    <path d="M9 4h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
    <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
  </svg>
);

export const HelpIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.2a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.9.7-.9 1.3v.5" strokeLinecap="round" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

/** Stacked lines with one leading: a list of things waiting their turn. */
export const QueueIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 6h10M4 12h16M4 18h13" />
    <path d="M18 4l2 2-2 2" />
  </Base>
);

export const PersonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Base>
);

export const SignOutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </Base>
);

export const PeopleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.6" />
    <path d="M17.5 20a5.5 5.5 0 0 0-2.2-4.4" />
  </Base>
);

/** Stacked disks: what is kept on this machine. */
export const StorageIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
  </Base>
);

// How a line was said (Voice cues): one picture per cue, so a glance down the transcript finds them.
export const VolumeUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </Base>
);

export const VolumeDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </Base>
);

export const PitchUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 18V5l8-2" />
    <circle cx="6" cy="18" r="3" />
    <path d="m17 13 3-3 3 3M20 10v10" />
  </Base>
);

export const PitchDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 18V5l8-2" />
    <circle cx="6" cy="18" r="3" />
    <path d="m17 17 3 3 3-3M20 20V10" />
  </Base>
);

export const RabbitIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M13 16a3 3 0 0 1 2.24 5" />
    <path d="M18 12h.01" />
    <path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3" />
    <path d="M20 8.54V4a2 2 0 1 0-4 0v3" />
    <path d="M7.612 12.524a3 3 0 1 0-1.6 4.3" />
  </Base>
);

export const TurtleIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z" />
    <path d="M4.82 7.9 8 10" />
    <path d="M15.18 7.9 12 10" />
    <path d="M16.93 10H20a2 2 0 0 1 0 4H2" />
  </Base>
);

// What a line sounded like (Emotion): a face for each of the three it can be labelled with.
export const FaceJoyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <path d="M9 9h.01M15 9h.01" />
  </Base>
);

export const FaceAngerIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <path d="M7.5 8 10 9M14 9l2.5-1" />
    <path d="M9 10h.01M15 10h.01" />
  </Base>
);

export const FaceSadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16.5s-1.5-2-4-2-4 2-4 2" />
    <path d="M9 9h.01M15 9h.01" />
    <path d="M8 11.5c0 .8-.6 1.5-.6 2.1a.6.6 0 0 0 1.2 0c0-.6-.6-1.3-.6-2.1Z" />
  </Base>
);

// The sidebar and the first screen (v4).
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);

/** Letters with a tick under them: the transcript checked against the glossary. */
export const SpellCheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m5 15 5-11 5 11" />
    <path d="M7 11h6" />
    <path d="m14 19 2.5 2.5L21 17" />
  </Base>
);

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5-1.5l1.5-4l4-4" />
    <path d="M9 15l-4.5 4.5" />
    <path d="M14.5 4l5.5 5.5" />
  </Base>
);

/** Standing straight: what is pinned. The tilted PinIcon is the offer to pin. */
export const PinnedIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </Base>
);

export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </Base>
);

export const ChevronUpIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m6 15 6-6 6 6" />
  </Base>
);

/** A page with lines: minutes. */
export const NotesIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 7h6" />
    <path d="M9 11h6" />
    <path d="M9 15h4" />
  </Base>
);

export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M10 14 21 3" />
    <path d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1Z" />
  </Base>
);

export const PanelLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </Base>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Base>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);

export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5" />
    <path d="M12 3v12" />
  </Base>
);

export const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" />
  </Base>
);

export const UserPlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
  </Base>
);

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
  </Base>
);

export const CalendarPlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
    <path d="M16 2v4M8 2v4M3 10h18M19 16v6M16 19h6" />
  </Base>
);

export const CalendarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Base>
);
