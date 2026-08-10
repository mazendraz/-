/**
 * The API's root page.
 *
 * This was the untouched create-next-app scaffold — the Next.js logo, "To get
 * started, edit the page.tsx file", and a "Create Next App" title — served from
 * a production host. It advertised the framework and read as an unfinished
 * deployment to anyone who hit the origin directly.
 *
 * Replaced with something true and boring. It deliberately links nothing and
 * lists no routes: an unauthenticated visitor gets no map of the surface, and
 * the health endpoint is the only thing an operator actually needs from here.
 */
export default function ApiIndex() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: "34rem",
        margin: "12vh auto",
        padding: "0 1.5rem",
        lineHeight: 1.6,
        color: "#0c1a22",
      }}
    >
      <h1 style={{ fontSize: "1.35rem", margin: "0 0 0.5rem" }}>Al Assema API</h1>
      <p style={{ margin: 0, color: "#3d5560" }}>
        This host serves the API only. There is no site to browse here.
      </p>
    </main>
  );
}
