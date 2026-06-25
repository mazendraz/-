import { z } from "zod";

// Image reference accepted by the admin endpoints:
//   - http(s) URL          (uploaded / external)
//   - data:image/... URL   (client-side compressed in the admin UI)
//   - /site-relative path  (seeded assets like /img/seed-01.jpg)
export const imageRef = z.string().refine(
  (v) =>
    /^https?:\/\//i.test(v) || /^data:image\//i.test(v) || v.startsWith("/"),
  { message: "Must be a URL, data URL, or site-relative path" },
);
