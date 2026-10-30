// Vitest (Vite) can import any file's text with a `?raw` suffix.
declare module "*?raw" {
  const text: string;
  export default text;
}
