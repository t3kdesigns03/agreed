# Agreed v1.5 - demo fixes - paste-ready Claude Code prompt

Work in the Agreed repo (E:\T3KDesigns\Agreed). This is a fixes-only pass for the demo at agreed.t3kdesigns.app, based on the live browser check on Oct 30, 2026. Do not add a backend, do not add an Accept button click, and do not change the on-device summarizer logic unless a fix below requires it.

Open a PR and ask before merging. Never merge without Brandon's explicit approval.

## Standing rules to keep
- Agreed only explains. It never presses Accept or Reject for the user.
- Cards are automatic summaries, not legal advice. Keep that line on every card.
- No server, no account, no data leaving the device for the demo itself.

## Fixes

1. Sample grid dismissal, make it consistent
   - Right now sample card Close / Looks okay / Be careful actions are logged, but the sample cards mostly stay visible. One green card vanished on Escape then came back on the next click.
   - Fix: dismissing a sample card actually removes that card from the grid, and add a clear "Reset sample cards" control to bring them all back.
   - Fix Escape in the sample grid so it behaves the same every time, matching the floating card, which already disappears correctly on Escape.
   - Keep the demo log entries for each dismissal.

2. Fixed cookie banner overlap
   - The fixed banner at the bottom overlaps page content on first load, partly covering sample cards and the live-detection log until the user scrolls.
   - Fix: add bottom padding / safe area to the page content equal to the banner height, so no demo content is hidden behind the banner at any viewport width. Check desktop and phone widths.

3. Floating card overlap, keep it usable
   - The floating card overlapping page content while open is expected, but make sure it never blocks its own Close / Escape path.
   - Keep the current correct behavior: Escape removes the floating card, and the underlying cookie banner stays untouched with Accept all / Reject unpressed.

4. Network wording, make demo and privacy page agree
   - The demo header currently says, in absolute terms, that nothing goes over the network.
   - The privacy page at /privacy qualifies this for the real extension: the only network request is a same-site policy download when a banner links to a same-site policy page.
   - Fix: change the demo header to accurate wording, for example: demo itself makes no network requests; the real extension's only network request is a same-site policy download. Do not keep an absolute claim that the extension never makes any request.

5. Loading card, label it as a static example
   - The Loading sample card stays on "Reading the fine print for you..." forever, which looks broken.
   - Fix: label it clearly as an example of the loading state, so a visitor knows it is a static showcase, not a stuck process.

6. Show the real terms in the demo, clarify it is a demo link
   - In the demo, Show the real terms scrolls to the in-page Sample policy box, while on a real site it opens the site's own policy in a new tab.
   - Fix: keep the anchor behavior for the demo, but make that distinction visible near the sample cards, so a visitor does not mistake the demo anchor for a real policy link.

7. Privacy page consistency check
   - After the wording fix in 4, re-check /privacy for consistency: free extension by T3KDesigns, no server, no account, does not collect / sell / send browsing data, reads banner and terms text on-device, cards can miss things, not legal advice, No red flags found means no looked-for problems were spotted, not that terms are safe, never clicks Accept, closed cards remembered only as website address + notice type for 7 days in extension storage, contact via GitHub issues.
   - Fix any line that contradicts the demo after the other fixes.

## Acceptance checks
- Run detection still finds the cookie banner, shows the floating yellow card with the 142-partner summary, Be careful flips to the "nothing has been accepted" state, Escape removes the floating card, banner stays untouched.
- Tab focus is visible through card controls.
- Sample cards dismiss and reset reliably, every time, with log entries.
- No demo content is hidden behind the fixed banner on first load.
- Demo header wording and /privacy wording agree on network requests.

## Tests and delivery
- Add or update tests for: sample grid dismiss and reset, Escape in grid and in floating card, banner padding / no overlap, and demo vs privacy wording.
- Run the full test suite and all builds. Report failures, do not hide them.
- Open a PR with a short summary of each fix and how it was verified in the demo. Ask Brandon before merging.
