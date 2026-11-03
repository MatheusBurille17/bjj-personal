import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      BJJ_STORE: "memory",
      AUTH_SECRET: "test-secret-with-enough-length-123456",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      NEXT_PUBLIC_GOOGLE_REDIRECT_URI:
        "http://localhost:3000/api/auth/google/callback",
      GOOGLE_TOKEN_ENCRYPTION_KEY:
        "test-google-token-encryption-key-with-at-least-32-chars",
      GOOGLE_TOKEN_ENCRYPTION_SALT: "test-google-oauth-salt",
      OAUTH_RATE_LIMIT_MAX: "10",
      OAUTH_RATE_LIMIT_WINDOW_MS: "60000",
      NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI:
        "http://localhost:3000/api/google-drive/oauth/callback",
      GOOGLE_DRIVE_SCOPES:
        "openid email https://www.googleapis.com/auth/drive.file",
      GOOGLE_DRIVE_FOLDER_ROOT: "Plataforma de Treinamento",
      GOOGLE_DRIVE_MAX_FILE_BYTES: "5368709120",
      GOOGLE_DRIVE_RETRY_BASE_MS: "0",
      GOOGLE_DRIVE_MAX_RETRIES: "2",
      GOOGLE_DRIVE_CIRCUIT_BREAKER_MS: "300000",
      PLAYBACK_TOKEN_SECRET:
        "test-playback-secret-with-enough-length-1234567890",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/supabase/**", "lib/resend/**", "lib/mux/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
