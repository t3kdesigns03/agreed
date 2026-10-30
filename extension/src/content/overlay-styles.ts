// Styles for the summary card. They live inside a closed Shadow DOM, so the
// page's CSS can't reach them and they can't leak out. Sizes are in px on
// purpose: page `rem`/`em` settings must not shrink the text.
export const CARD_CSS = `
:host {
  all: initial;
}

.wrap {
  --bg: #ffffff;
  --text: #111111;
  --muted: #333333;
  --border: #111111;
  --focus: #1d3b9e;
  --primary-bg: #1d3b9e;
  --primary-text: #ffffff;
  --secondary-bg: #ffffff;
  --secondary-text: #111111;
  --link: #1d3b9e;
  --green-bg: #e3f4e8;
  --green-text: #0a5223;
  --yellow-bg: #fff2bf;
  --yellow-text: #4f3900;
  --red-bg: #fde0e3;
  --red-text: #840c17;

  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  right: 16px;
  z-index: 2147483647;
  width: min(440px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 20px;
  line-height: 1.45;
  color: var(--text);
  text-align: left;
  -webkit-text-size-adjust: 100%;
}

.wrap.inline {
  position: relative;
  top: auto;
  right: auto;
  max-height: none;
  width: min(440px, 100%);
}

@media (prefers-color-scheme: dark) {
  .wrap {
    --bg: #161616;
    --text: #f7f7f7;
    --muted: #d6d6d6;
    --border: #f7f7f7;
    --focus: #9db8ff;
    --primary-bg: #9db8ff;
    --primary-text: #0b0b0b;
    --secondary-bg: #161616;
    --secondary-text: #f7f7f7;
    --link: #9db8ff;
    --green-bg: #10301c;
    --green-text: #9ff0b8;
    --yellow-bg: #362b07;
    --yellow-text: #ffdf6e;
    --red-bg: #3d0f15;
    --red-text: #ffb0b8;
  }
}

@media (max-width: 600px) {
  .wrap:not(.inline) {
    top: max(8px, env(safe-area-inset-top));
    right: 8px;
    left: 8px;
    width: auto;
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
}

*, *::before, *::after {
  box-sizing: border-box;
}

.card {
  margin: 0;
  padding: 20px 22px 18px;
  background: var(--bg);
  color: var(--text);
  border: 3px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

/* When the floating card is taller than the screen and scrolls, keep the
   close button in view so there's always a way out. */
.wrap:not(.inline) .top {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg);
}

.brand {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--muted);
}

.close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -8px -10px -8px 0;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.close svg {
  width: 26px;
  height: 26px;
}

.close:hover {
  border-color: var(--border);
}

h2 {
  margin: 0;
  font-size: 25px;
  line-height: 1.25;
  font-weight: 800;
  color: var(--text);
  outline: none;
}

.subtitle {
  margin: 2px 0 14px;
  font-size: 17px;
  color: var(--muted);
}

.risk {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 2px solid currentColor;
  border-radius: 12px;
}

.risk svg {
  flex: none;
  width: 30px;
  height: 30px;
  margin-top: 2px;
}

.risk-green { background: var(--green-bg); color: var(--green-text); }
.risk-yellow { background: var(--yellow-bg); color: var(--yellow-text); }
.risk-red { background: var(--red-bg); color: var(--red-text); }

.risk-label {
  display: block;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.25;
}

.risk-reason {
  display: block;
  font-size: 18px;
  line-height: 1.35;
}

.points {
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.points li {
  position: relative;
  margin: 0 0 10px;
  padding-left: 26px;
}

.points li::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 0.55em;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text);
}

p {
  margin: 0 0 12px;
}

.disclaimer {
  margin: 0 0 12px;
  font-size: 16px;
  line-height: 1.35;
  color: var(--muted);
}

.status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 6px 0 16px;
}

.spinner {
  flex: none;
  width: 26px;
  height: 26px;
  border: 4px solid var(--muted);
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border-right-color: var(--muted);
    opacity: 0.6;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 4px 0 12px;
}

.actions button {
  flex: 1 1 160px;
}

button.primary,
button.secondary {
  min-height: 54px;
  padding: 10px 16px;
  border-radius: 12px;
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
}

button.primary {
  border: 3px solid var(--primary-bg);
  background: var(--primary-bg);
  color: var(--primary-text);
}

button.secondary {
  border: 3px solid var(--border);
  background: var(--secondary-bg);
  color: var(--secondary-text);
}

button.primary:hover,
button.secondary:hover {
  filter: brightness(0.92);
}

/* Always show focus on controls (not only :focus-visible): it helps anyone
   unsure where they are, and is not distracting on a short-lived card. */
button:focus,
a:focus {
  outline: 4px solid var(--focus);
  outline-offset: 3px;
}

button.primary:focus {
  box-shadow: 0 0 0 3px var(--bg);
}

.footer {
  font-size: 17px;
}

.real-terms {
  display: inline-block;
  padding: 6px 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

@media (forced-colors: active) {
  .card, .risk, button.primary, button.secondary {
    border-color: CanvasText;
  }
  .points li::before {
    background: CanvasText;
  }
}
`;
