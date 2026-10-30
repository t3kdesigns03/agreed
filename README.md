# Agreed

Agreed is a browser extension that explains what you're agreeing to. When a website shows a cookie banner, a
"By continuing you agree…" line, or a Terms of Service pop-up, Agreed shows a short, large-print card in plain
English, with a green, yellow or red rating:

> **What you're agreeing to**
> ⚠ **Watch out**: They may sell your personal information.
> • They may sell your personal information to other companies.
> • If you sign up, they will keep charging you until you cancel.
> • If something goes wrong, you can't take them to court. A private judge decides.
> **[Looks okay]  [Be careful]**   *Show the real terms*

It is built for people who will never open a settings page: parents, grandparents, kids. It needs no setup, no
copy-and-paste and no account. **Everything happens on the device**: there is no server, no API key and nothing to
pay for, and nothing about the user or their browsing is sent anywhere.

- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [How the summary is made](#how-the-summary-is-made)
- [Desktop: Chrome, Edge, Brave, Opera, Vivaldi](#desktop-chrome-edge-brave-opera-vivaldi)
- [Desktop and Android: Firefox](#desktop-and-android-firefox)
- [Safari on macOS, iPhone and iPad](#safari-on-macos-iphone-and-ipad)
- [Android: what works and what doesn't](#android-what-works-and-what-doesnt)
- [Detection and tuning](#detection-and-tuning)
- [Privacy](#privacy)
- [Legal and security](#legal-and-security)
- [Accessibility](#accessibility)
- [Placeholders to replace before release](#placeholders-to-replace-before-release)
- [Known limitations](#known-limitations)

## How it works

```
 web page                         extension (all on the device)
┌──────────────┐   detect    ┌──────────────────────────────────────────────┐
│ cookie banner│ ──────────▶ │ content script                               │
│ TOS modal    │             │  • scores consent UIs (patterns.ts)          │
│ "By signing  │             │  • gets the banner text, plus the linked     │
│  up you      │             │    policy page if it's on the same website   │
│  agree…"     │ ◀────────── │  • summarizes with rules (rules.ts)          │
└──────────────┘    card     │  • shows the card in a closed Shadow DOM     │
                             └──────────────────────────────────────────────┘
```

1. The content script runs on every http(s) page. It scores visible elements against
   [`patterns.ts`](extension/src/content/patterns.ts) (known consent managers, cookie/consent attributes, accept
   buttons, "by continuing you agree" phrases, links to terms/privacy/cookie policies). It shows at most one card per
   page load, and not again for the same site and kind for 7 days after it's closed.
2. If the banner links to a full policy **on the same website**, the content script downloads that page without
   cookies or a referrer and extracts its readable text in an inert `DOMParser` document. Policies on other websites
   are skipped and the banner text is used alone. The banner's own text always comes first, because it says what
   "Accept" actually does.
3. The [rule-based summarizer](#how-the-summary-is-made) reads that text on the device and picks 2–3 plain-English
   sentences and a green, yellow or red rating. It takes milliseconds and needs no network.
4. The card shows the result. If anything fails, it shows a fallback card with "Show the real terms" and Close.
   **A failed summary never blocks the user from accepting**: the card is non-modal, sits at the top of the
   screen away from most banners, and closes with ×, Escape, or automatically when the banner goes away.
5. **Agreed only explains.** It never presses "Accept", "Reject" or anything else on the page. Every summary card
   says it's an automatic summary and not legal advice, above the buttons, before the user decides anything.

## Repository layout

```
extension/
  src/summarize/rules.ts     Tunable summary rules: what to look for, what to say, how risky
  src/summarize/summarize.ts The on-device summarizer
  src/content/patterns.ts    Tunable detection patterns and weights
  src/content/detect.ts      Consent UI detection and scoring
  src/content/extract.ts     Policy text extraction
  src/content/overlay.ts     The card (closed Shadow DOM)
  src/content/index.ts       Page flow: scan, card, dismissals
  src/content/policy-fetch.ts Same-website policy download (no cookies, no referrer)
  static/privacy.html        Privacy and disclaimer page, bundled into the extension
  src/popup/                 Toolbar popup: "Check this page now"
  src/shared/                Types, messages, browser API shim
  demo/                      Standalone demo page for the card and detector
  scripts/build.mjs          Builds dist/chrome, dist/firefox, dist/safari, dist/demo
  scripts/make-icons.mjs     Regenerates the PNG icons in static/icons
```

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
```

```bash
npm run check
```

`check` type-checks, runs the tests (detection heuristics, the summary rules, text extraction, the card) and builds
every target into `extension/dist/`.

To see the card without installing anything, build and open the demo page:

```bash
npm run build && npx esbuild --servedir=extension/dist/demo --serve=5173
```

Then visit http://localhost:5173. It runs the real summarizer on sample policy text to render green, yellow and red
cards (plus loading and fallback cards), and runs the real detector and summarizer on a sample cookie banner.

## How the summary is made

There is no AI model and no server. [`rules.ts`](extension/src/summarize/rules.ts) is a list of rules; each one
looks for one kind of clause and has a hand-written plain-English sentence for the card:

| Rating | Rules |
|---|---|
| **red** | Sells personal information or uses data brokers · automatic renewal or charges after a free trial · collects exact location, face or voice data, health data or contacts · a perpetual, irrevocable license to the user's photos and posts |
| **yellow** | Gives up the right to go to court (arbitration) · shares with *N* partners (the number is read from the text) · uses activity for ads · a "Do Not Sell or Share My Personal Information" link · shares with third parties · can close accounts without warning · can change the terms at any time · keeps data indefinitely · analytics cookies |
| **good** | Says it doesn't sell personal information · only essential cookies · you can reject optional cookies · you can ask for your data to be deleted |

How a card is put together:

- The text is split into sentences. A rule fires when one sentence matches one of its patterns.
- **Negation is checked close to the verb**: "We do **not** sell your personal information" doesn't fire the
  selling rule (it fires the reassuring "They say they don't sell" rule instead), but "We sell your data and you
  **cannot** opt out" still does. Sentences ending in "?" (headings like "Do we sell your data?") don't trigger
  warnings.
- Some rules hide others that would repeat them: "shares with 142 partners" hides the generic "shares with other
  companies".
- **Rating**: red if any red rule fired, else yellow if any yellow rule fired, else green if a reassuring rule fired.
  If nothing was recognized, the card is yellow with "We couldn't find the key details. Take a quick look yourself."
  Green never means "certified safe": its reason says "We didn't find anything worrying."
- **Points**: the most important warnings first (by priority), leaving room for one reassuring fact such as "You can
  say no to the extra cookies". Always 2–3 points; a short context sentence fills in when only one was found.
- It's deterministic: the same text always gives the same card.

To tune it, edit a rule's `patterns`, `point`, `reason` or `priority` in `rules.ts` and add a case to
[`test/summarize.test.ts`](extension/test/summarize.test.ts). Every point must stay at 20 words or fewer (a test
checks).

**Trade-offs versus an AI summary**: rules only know the clauses someone wrote a rule for, so unusual terms are
missed, and the sentences are generic ("They may sell your personal information") rather than specific to the site.
In return it's free, instant, works offline, can't be talked into anything by the page, and never sends the text
anywhere. An earlier version of this project used a Claude-powered backend instead; it is in git history (commit
`197e44f`) if a paid, AI-written summary is ever wanted.

## Desktop: Chrome, Edge, Brave, Opera, Vivaldi

```bash
npm run build
```

- **Chrome, Brave, Vivaldi, Opera:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
  and choose `extension/dist/chrome`.
- **Edge:** open `edge://extensions`, turn on **Developer mode**, **Load unpacked**, choose `extension/dist/chrome`.
- **Store packages:** zip the *contents* of `extension/dist/chrome` (so `manifest.json` is at the root of the zip) and
  upload it to the Chrome Web Store or Microsoft Edge Add-ons. No store listings exist yet.

## Desktop and Android: Firefox

`extension/dist/firefox` declares Firefox for Android support
(`gecko_android`). Firefox 128 or newer is required.

- **Desktop, for testing:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick
  `extension/dist/firefox/manifest.json`.
- **Android, for testing:** follow Mozilla's
  [web-ext guide for Firefox for Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/):
  enable USB debugging, connect the phone, then
  `npx web-ext run -t firefox-android -s extension/dist/firefox --android-device <device-id>`.
- **Release:** set your own add-on ID (see [placeholders](#placeholders-to-replace-before-release)), build, and submit
  `extension/dist/firefox` to addons.mozilla.org, marking it compatible with Android. Once listed, Android users
  install it from the Firefox add-ons menu.
- The manifest declares `data_collection_permissions: none`: Agreed collects and transmits nothing.

## Safari on macOS, iPhone and iPad

Safari extensions ship inside a small app, built with Xcode on a Mac. `extension/dist/safari` is the input.

1. Build the extension with `npm run build`.
2. Convert it to an Xcode project (the `safari/` output folder is git-ignored):

   ```bash
   xcrun safari-web-extension-converter extension/dist/safari --project-location safari --app-name Agreed --bundle-identifier com.example.agreed
   ```

   Replace `com.example.agreed` with your own bundle identifier. The converter creates both macOS and iOS targets
   by default.
3. Open the project in Xcode, set your signing team, and run the macOS or iOS scheme.
4. Turn it on:
   - **macOS:** Safari → Settings → Extensions → Agreed. For local unsigned builds, first enable
     Develop → Allow Unsigned Extensions.
   - **iPhone/iPad:** Settings → Apps → Safari → Extensions → Agreed → turn on, and set **Allow on every website**
     (older iOS versions: Settings → Safari → Extensions).
5. Safari asks users to grant website access. Agreed needs **All Websites** to spot consent banners wherever they
   appear. Without it, Safari asks per site.
6. To release, archive and submit the app through App Store Connect.

## Android: what works and what doesn't

Plainly:

- **Chrome for Android does not support extensions.** There is no way to install Agreed, or any other extension,
  in Chrome on Android. Nothing in this repository changes that.
- **Firefox for Android works.** It supports Manifest V3 extensions, and this build targets it (see
  [Firefox](#desktop-and-android-firefox)). This is the recommended Android option.
- **Microsoft Edge for Android** has been rolling out extension support, but only for extensions in Microsoft's own
  Android catalog, and availability has varied by version and channel. Check the current Edge release before telling
  anyone it works. Getting Agreed there requires publishing it to Microsoft Edge Add-ons first.
- **Vivaldi** runs Agreed on desktop (use the Chrome build). As far as we know, **Vivaldi for Android does not
  support extensions**. Check before recommending it.
- Some other Chromium-based Android browsers advertise Chrome Web Store support. They are untested with Agreed.

## Detection and tuning

All detection knobs (deciding *whether* a page is asking for consent) live in [`extension/src/content/patterns.ts`](extension/src/content/patterns.ts):

| Signal | Weight |
|---|---|
| Matches a known consent manager (OneTrust, Cookiebot, Didomi, Quantcast, TrustArc, Osano, …) | 5 |
| Button whose *whole* label is "Accept all", "I agree", "Allow cookies", … | 3 |
| "By continuing / signing up / clicking … you agree", "I agree to the Terms" | 3 |
| id / class / aria-label mentions cookie, consent, GDPR, CMP | 2 |
| "We use cookies", "This site uses cookies" | 2 |
| Links to a terms, privacy or cookie policy | 2 |
| Dialog, `<dialog open>`, fixed or sticky position | 1 |
| Weak button: "OK", "Got it", "Continue" | 1 |

A card appears when the best candidate scores **5** (`SCORE_THRESHOLD`). "Check this page now" in the toolbar popup
uses a lower threshold of 3, and also summarizes the page itself when you're on a page like `/privacy` or `/terms`.

Guards against being too eager:

- Hidden elements and elements with more than 20,000 characters (whole pages) are ignored.
- An ordinary dialog with an "Accept" button (an invitation, say) scores 4 and is ignored.
- An article that merely says "we use cookies" and links to a privacy policy scores 4 and is ignored.
- One card per page load. The page is watched for 30 seconds after it loads (banners often appear late), then
  detection stops.
- After a card closes for any reason, no card for the same site and kind for 7 days.
- When the user accepts or rejects on the site itself and the banner disappears, the card closes by itself.
- Agreed never presses any button on the page. Accept buttons are only used as a detection signal.

The tests in [`extension/test/detect.test.ts`](extension/test/detect.test.ts) cover each of these cases. Add a case
there when you tune a pattern.

## Privacy

The full user-facing notice is [`extension/static/privacy.html`](extension/static/privacy.html). It is bundled into
the extension (linked from the toolbar popup) and published on the demo site.

**There is no Agreed server, and nothing about the user is sent to us or anyone else.** The only network request the
extension makes:

- **Downloading a linked policy page from the same website.** When a banner links to its cookie, privacy or terms
  page on the site the user is already on, the content script downloads that page with cookies omitted
  (`credentials: "omit"`) and no referrer. Links to other websites are never fetched.

The content script reads only the consent banner's text and button labels, and the policy page's text. It never reads
form fields, passwords or anything the user types.

Permissions: **`storage` only.** No host permissions and no background script. The content script runs on http(s)
pages because that's where consent banners appear.

What stays on the device (`chrome.storage.local`): which site and kind of card was closed, so it doesn't reappear.
Entries are deleted after 7 days.

## Legal and security

This project was checked against the T3KDesigns legal + security one-pager before release. The filled-in checklist,
with the reasoning for each box and the open review items, is in
[`docs/legal-security-checklist.md`](docs/legal-security-checklist.md).

## Accessibility

- 20–25 px text, a 3 px card border, and color contrast above WCAG AA in both light and dark mode. The rating is
  shown with an icon *and* a word ("No red flags found", "Read with care", "Watch out"), never color alone.
- Real `<button>` and `<a>` elements, `role="dialog"` with `aria-labelledby`, and an `aria-live` region so screen
  readers announce when the summary arrives.
- Focus moves to the card when it opens and returns to where it was when it closes. Every control has a visible focus
  ring. Escape closes the card.
- 54 px tall buttons, full-width on phones, respects `prefers-reduced-motion`, `prefers-color-scheme`, Windows
  high-contrast mode and iOS safe areas.
- The card lives in a closed Shadow DOM: page CSS can't shrink or hide it, and page scripts can't read or click it.

## Placeholders to replace before release

| What | Where | Placeholder |
|---|---|---|
| Firefox add-on ID | `FIREFOX_ADDON_ID` in `extension/scripts/build.mjs` | `agreed@example.com` |
| Safari bundle id | `safari-web-extension-converter --bundle-identifier` | `com.example.agreed` |
| Store listings | Chrome Web Store, Edge Add-ons, addons.mozilla.org, App Store | none exist yet |

## Known limitations

- **Banners inside iframes are not detected.** Some consent managers (Sourcepoint, some TCF frameworks) render the
  banner in a cross-origin iframe, and the content script only runs in the top frame. Use "Check this page now" or
  open the site's policy page.
- **Closed shadow roots.** Banners inside closed shadow roots can't be read. Open shadow roots are scanned.
- **JavaScript-only policy pages.** If a linked policy page needs JavaScript to show its text, the fetched HTML is
  nearly empty and the card summarizes the banner text instead.
- **Single-page apps.** The page is watched for 30 seconds after load, not after in-app navigation.
- **English only.** The detection patterns and summary rules assume English. Other languages need their own
  patterns.
- **Rules, not understanding.** The summary only covers clauses the rules know about. See
  [How the summary is made](#how-the-summary-is-made).
- **Card position.** The card sits at the top right (top of the screen on phones). A banner pinned to the top of the
  page can end up behind it. The card can always be closed, and the site's buttons stay usable.
