// Builds the extension for each browser into dist/<target>/, plus the demo page.
//
//   PLAINAGREE_BACKEND_URL=https://plainagree-api.example.workers.dev npm run build
//   npm run watch      # rebuild on change
//
// Targets: chrome (also Edge, Opera, Brave, Vivaldi), firefox (desktop and
// Android), safari (input for Xcode's safari-web-extension-converter).
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

// PLACEHOLDER: the real deployment URL comes from PLAINAGREE_BACKEND_URL. Until
// it is set, the extension shows the fallback card instead of a summary.
const PLACEHOLDER_BACKEND_URL = "https://plainagree-api.YOUR-SUBDOMAIN.workers.dev";
const backendUrl = process.env.PLAINAGREE_BACKEND_URL || PLACEHOLDER_BACKEND_URL;
if (backendUrl === PLACEHOLDER_BACKEND_URL) {
  console.warn(
    "\n⚠  PLAINAGREE_BACKEND_URL is not set. The build will show the fallback card instead of summaries.\n" +
      "   Set it to your deployed Worker URL, e.g. PLAINAGREE_BACKEND_URL=http://localhost:8787 for `wrangler dev`.\n",
  );
}

// PLACEHOLDER: replace with your own add-on ID before publishing to addons.mozilla.org.
const FIREFOX_ADDON_ID = "plainagree@example.com";

const TARGETS = ["chrome", "firefox", "safari"];

function manifest(target) {
  const base = {
    manifest_version: 3,
    name: "PlainAgree",
    version,
    description: "Plain-English summaries of the terms, privacy policies and cookie banners you're asked to agree to.",
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    action: {
      default_title: "PlainAgree",
      default_popup: "popup.html",
      default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
    },
    permissions: ["storage"],
    // Needed to read linked policy pages from the background script and to reach the backend.
    host_permissions: ["http://*/*", "https://*/*"],
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["content.js"],
        run_at: "document_idle",
        all_frames: false,
      },
    ],
  };

  if (target === "chrome") {
    return { ...base, background: { service_worker: "background.js" }, minimum_chrome_version: "116" };
  }
  if (target === "firefox") {
    return {
      ...base,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          id: FIREFOX_ADDON_ID,
          strict_min_version: "128.0",
          data_collection_permissions: { required: ["websiteContent"] },
        },
        gecko_android: { strict_min_version: "128.0" },
      },
    };
  }
  // Safari (macOS and iOS): a non-persistent background page is the most widely supported form.
  return { ...base, background: { scripts: ["background.js"], persistent: false } };
}

const common = {
  bundle: true,
  format: "iife",
  target: ["chrome116", "firefox128", "safari16"],
  define: { __BACKEND_URL__: JSON.stringify(backendUrl) },
  logLevel: "info",
  legalComments: "none",
};

function writeStatic(target) {
  const out = join(dist, target);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest(target), null, 2));
  cpSync(join(root, "src", "popup", "popup.html"), join(out, "popup.html"));
  cpSync(join(root, "src", "popup", "popup.css"), join(out, "popup.css"));
  cpSync(join(root, "static", "icons"), join(out, "icons"), { recursive: true });
}

rmSync(dist, { recursive: true, force: true });

const builds = [
  ...TARGETS.map((target) => ({
    ...common,
    entryPoints: {
      content: join(root, "src", "content", "index.ts"),
      background: join(root, "src", "background", "index.ts"),
      popup: join(root, "src", "popup", "popup.ts"),
    },
    outdir: join(dist, target),
  })),
  {
    ...common,
    entryPoints: { demo: join(root, "demo", "demo.ts") },
    outdir: join(dist, "demo"),
  },
];

for (const target of TARGETS) writeStatic(target);
mkdirSync(join(dist, "demo"), { recursive: true });
cpSync(join(root, "demo", "index.html"), join(dist, "demo", "index.html"));

if (watch) {
  for (const options of builds) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
  console.log("Watching for changes…");
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  console.log(`\nBuilt ${TARGETS.join(", ")} and demo into ${dist}`);
}
