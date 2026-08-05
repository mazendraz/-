import path from "node:path";
import { fileURLToPath } from "node:url";

// Where auth.setup.ts writes the saved sessions and ui-audit.spec.ts reads
// them from. A plain module rather than an export on either side: Playwright
// refuses to let one test file import another, and both of those are test
// files (they match the `setup` and `chromium` projects' testMatch).
//
// app/package.json is `"type": "module"`, so there is no __dirname here.
const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ADMIN_STATE = path.join(HERE, ".auth/admin.json");
export const PROVIDER_STATE = path.join(HERE, ".auth/provider.json");
