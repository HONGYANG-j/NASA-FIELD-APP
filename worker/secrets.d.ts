// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them. Set with: npx wrangler secret put GROQ_API_KEY
declare global {
  interface Env {
    GROQ_API_KEY?: string
    /** Local testing only (in .dev.vars): address of a fake model. Never set in production. */
    AI_BASE_URL?: string
  }
}
export {}
