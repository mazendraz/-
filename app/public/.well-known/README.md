# `.well-known/` — deep-link association files

These two files are what make `https://alassema.com/requests` open the APP
instead of the browser, on a phone that has it installed. Both are fetched by
the operating system, not by anything in our code, which is why the details
below matter more than they look.

## Placeholders that MUST be replaced before the apps ship

Neither file works as committed — each carries a placeholder that can only be
filled in once the app identities exist:

| File | Placeholder | Where it comes from |
| ---- | ----------- | ------------------- |
| `apple-app-site-association` | `TEAMID` | Apple Developer → Membership → Team ID (needs the paid account) |
| `assetlinks.json` | `REPLACE_WITH_RELEASE_SHA256` | The SHA-256 of the **release** signing certificate — `eas credentials`, or `keytool -list -v -keystore …` |

The Android fingerprint is the one people get wrong: it must be the RELEASE
key, not the debug key. A debug fingerprint here means links work on the
developer's machine and open the browser for everybody else.

## Serving rules (already handled — see deploy/Caddyfile)

* Both must be served over HTTPS from the site root, with **no redirect**. iOS
  follows no redirects at all when fetching the association file.
* `apple-app-site-association` has **no file extension** and must be served as
  `application/json`. Caddy would otherwise guess `application/octet-stream`
  and iOS silently ignores it — a failure with no error message anywhere.
* Both must be reachable without authentication.

## Verifying

```bash
curl -sI https://alassema.com/.well-known/apple-app-site-association   # 200, application/json, no redirect
curl -s  https://alassema.com/.well-known/assetlinks.json | jq .
```

Android additionally caches these aggressively: after changing `assetlinks.json`
reinstall the app rather than assuming the change didn't take.
