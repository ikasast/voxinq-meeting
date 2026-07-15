import type { MetadataRoute } from "next";

// PWA manifest. Defines add-to-home-screen and the "new recording" shortcut.
// Icons are placed by the user under public/icons/ (installation works even without them).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voxinq Meeting",
    // Home-screen labels truncate around ~12 chars, so keep the short name short.
    short_name: "Voxinq",
    description: "Self-hosted meeting minutes system",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New recording",
        short_name: "Record",
        description: "Start recording a new meeting right away",
        url: "/quick-record",
      },
    ],
  };
}
