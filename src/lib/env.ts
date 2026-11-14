// Typed access to build-time env vars. Copy .env.example to .env.local and fill in.
// NOTE: VITE_* values are bundled into the client. Free NASA keys are fine here;
// never put paid or private secrets in a VITE_ variable.

export const env = {
  nasaApiKey: import.meta.env.VITE_NASA_API_KEY ?? 'DEMO_KEY',
}
