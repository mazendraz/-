// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// This is an npm workspaces monorepo, and other members (api/, app/) declare
// their own react peer ranges — npm's hoisting can leave a SECOND, different
// react/react-dom/scheduler copy sitting at the repo root (or elsewhere in
// the tree) alongside this app's own pinned copy, even at the identical
// version. Two PHYSICALLY separate copies still break React's hooks
// dispatcher singleton — confirmed on a real device (iOS, Expo Go): "Invalid
// hook call" inside expo-google-fonts' useFonts, with react's own dispatcher
// null.
//
// `resolver.extraNodeModules` does NOT fix this — it is only a FALLBACK
// Metro consults when normal node_modules resolution fails outright, and
// here normal resolution never fails (both copies are genuinely reachable).
// `resolveRequest` is the one Metro API that unconditionally intercepts
// EVERY resolution for these module names and forces them to one canonical
// path, regardless of which copy the importing file would otherwise have
// found nearest.
// The canonical node_modules to resolve these from — this app's OWN
// installed copies. Using plain `require.resolve` (not manual path-joining)
// so deep imports like "react/jsx-runtime" or "react-dom/client" go through
// package.json's real exports map instead of a hand-rolled reimplementation
// of it.
const canonicalNodeModules = require('node:path').join(__dirname, 'node_modules');
const dedupedPackages = new Set(['react', 'react-dom', 'scheduler']);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkg = moduleName.split('/')[0].startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
  if (dedupedPackages.has(pkg)) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [canonicalNodeModules] }),
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
