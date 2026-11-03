# Tasks: Google Social Authentication

## Phase 1: Setup & Infrastructure

- [x] 1.1 Create database migration for `user_google_oauth` table
  - Create migration file with table schema, indexes, and RLS policies
  - Columns: id, user_id, google_id, email, name, picture_url, encrypted_access_token, encrypted_refresh_token, token_iv, token_expiry_at, is_connected, scopes_granted, consent_timestamp, last_token_refresh_at, created_at, updated_at
  - Add RLS policy: users can only read/update their own record
  - Add foreign key constraint to auth.users
  - Add unique index on user_id

- [x] 1.2 Set up environment variables for Google OAuth
  - Create .env.example entries: NEXT_PUBLIC_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_GOOGLE_REDIRECT_URI
  - Verify environment variables are validated on app startup (lib/env.ts)
  - Document required values for dev and production

- [x] 1.3 Implement token encryption/decryption service
  - Create lib/services/token-encryption.service.ts
  - Implement encrypt(token: string): Promise<{encrypted: string, iv: string}>
  - Implement decrypt(encrypted: string, iv: string): Promise<string>
  - Use AES-256-GCM algorithm
  - Derive key from environment variable using PBKDF2
  - Generate random 12-byte IV for each encryption
  - Export encrypted output as Base64 strings

- [x] 1.4 Implement OAuth state management service
  - Create lib/services/oauth-state.service.ts
  - Generate random state parameter (32 bytes)
  - Generate PKCE code verifier (43-128 characters)
  - Create code challenge from verifier using SHA256
  - Store state + verifier + redirectPath in secure session cookie
  - Validate state on callback (check existence, expiry < 10 min)
  - Clear state after use

- [x] 1.5 Create Google OAuth API client
  - Create lib/google-oauth-client.ts
  - Initialize Google OAuth 2.0 client with credentials
  - Implement exchangeCodeForTokens(code, codeVerifier): Promise<{access_token, refresh_token, expires_in}>
  - Implement refreshAccessToken(refreshToken): Promise<{access_token, expires_in}>
  - Implement revokeToken(token): Promise<void>
  - Handle Google API errors with appropriate error codes

---

## Phase 2: Backend API Routes

- [x] 2.1 Implement POST /api/auth/google/authorize
  - Generate authorization URL with all parameters (client_id, redirect_uri, scope, state, code_challenge)
  - Validate redirect_path and connect_mode parameters
  - Store state + codeVerifier in session cookie
  - Return redirect response to Google OAuth endpoint
  - Handle errors: invalid parameters, state generation failure

- [x] 2.2 Implement GET /api/auth/google/callback
  - Extract code, state, error from query parameters
  - Validate state parameter (must match, not expired)
  - Handle user denial: error=access_denied
  - Exchange authorization code for tokens (via Google client)
  - Get user's Google profile (email, name, picture)
  - Handle existing user case: find by email, login
  - Handle new user case: create in Supabase Auth, set profile data
  - Handle connect mode: verify email matches existing user
  - Encrypt and store tokens in user_google_oauth table
  - Create Supabase session
  - Redirect to dashboard or specified path
  - Error handling: code invalid, exchange failure, email mismatch, database error

- [x] 2.3 Implement POST /api/auth/google/disconnect
  - Verify user is authenticated (get user from session)
  - Get user's google_oauth record
  - Call Google revoke endpoint with refresh token
  - Delete tokens from database (set is_connected = false)
  - Create audit log entry (without exposing token values)
  - Return success response
  - Error handling: user not authenticated, record not found, revocation failure

- [x] 2.4 Implement POST /api/auth/google/token/refresh
  - Verify user is authenticated
  - Get user's google_oauth record
  - Check if token expires within 5 minutes
  - If not expiring soon: return current expiry
  - If expiring soon: call refreshAccessToken via Google client
  - Decrypt refresh token, exchange, encrypt new access token
  - Update user_google_oauth record with new token + expiry
  - Handle refresh failure: mark is_connected = false if 401
  - Return success response with new expiry
  - Error handling: user not authenticated, record not found, refresh failure

- [x] 2.5 Add rate limiting to OAuth endpoints
  - Configure rate limiting middleware for /api/auth/google/* routes
  - Limit: 10 requests per minute per IP
  - Return 429 Too Many Requests when exceeded
  - Use appropriate headers: Retry-After, X-RateLimit-*

- [x] 2.6 Implement Google OAuth service layer
  - Create lib/services/google-auth.service.ts
  - Implement all service functions from design (generateAuthorizationUrl, exchangeCodeForTokens, encryptTokens, storeGoogleOAuth, etc.)
  - Use token encryption service
  - Use Google OAuth API client
  - Implement error handling with appropriate error codes
  - Add audit logging (without exposing tokens)

---

## Phase 3: Frontend Components

- [x] 3.1 Implement GoogleAuthButton component
  - Create components/auth/GoogleAuthButton.tsx
  - Props: mode ('login' | 'signup' | 'connect'), isLoading, redirectPath, className, onSuccess, onError
  - Render button with Google icon
  - Text varies by mode: "Continue with Google" / "Sign up with Google" / "Connect Google Account"
  - On click: POST to /api/auth/google/authorize, handle redirect
  - Show loading spinner during OAuth process
  - Display error toast on failure
  - On success: redirect to dashboard or specified path
  - Make the component accessible with proper ARIA labels

- [x] 3.2 Implement GoogleAccountStatus component
  - Create components/account/GoogleAccountStatus.tsx
  - Props: connected (boolean), googleEmail, googleName, picture, onConnectClick, onDisconnectClick, isLoading
  - Display two states:
    - Connected: Show profile info (picture, name, email), "Disconnect" button
    - Not connected: Show "Connect Google" button
  - Show last_token_refresh_at timestamp if available
  - Use shadcn/ui Card and Button components
  - Responsive design for mobile

- [x] 3.3 Implement GoogleDisconnectDialog component
  - Create components/account/GoogleDisconnectDialog.tsx
  - Props: open (boolean), onConfirm, onCancel, isLoading, googleEmail
  - Display warning message about revoking Google Drive access
  - List any features that depend on Google connectivity (future: video storage)
  - Require explicit confirmation
  - Disable "Confirm" button for 2 seconds after dialog opens (prevent accidental click)
  - Show loading spinner on confirm
  - Use shadcn/ui Dialog component

- [x] 3.4 Implement GoogleErrorAlert component
  - Create components/auth/GoogleErrorAlert.tsx
  - Props: error (string), onRetry, onDismiss
  - Map error codes to user-friendly messages:
    - access_denied → "You declined Google authorization..."
    - server_error → "Google encountered an error..."
    - network_error → "Connection error..."
    - token_refresh_failed → "Your Google connection expired..."
  - Display alert with error message
  - Show "Retry" button if onRetry provided
  - Show "Dismiss" button
  - Use shadcn/ui Alert component

- [x] 3.5 Update LoginForm component to include GoogleAuthButton
  - Add GoogleAuthButton in login form
  - Place above email input
  - Pass mode='login'
  - Handle success: redirect to dashboard
  - Handle error: show GoogleErrorAlert

- [x] 3.6 Update SignupForm component to include GoogleAuthButton
  - Add GoogleAuthButton in signup form
  - Place above email input
  - Pass mode='signup'
  - Handle success: redirect to dashboard/onboarding
  - Handle error: show GoogleErrorAlert

- [x] 3.7 Update user profile page (settings) to show GoogleAccountStatus
  - Add GoogleAccountStatus section in settings/profile page
  - Pass connected state from user's google_oauth record
  - Handle "Connect" button: open GoogleAuthButton (mode='connect')
  - Handle "Disconnect" button: open GoogleDisconnectDialog
  - Show loading/success/error states
  - Update UI after successful connect/disconnect

---

## Phase 4: Integration & Security

- [x] 4.1 Implement CSRF protection with State parameter validation
  - Verify state parameter on callback matches stored value
  - Check state hasn't expired (< 10 minutes old)
  - Reject callback if state validation fails
  - Test with mismatched/expired state values

- [x] 4.2 Implement PKCE (Proof Key for Code Exchange)
  - Generate code_verifier in authorize endpoint
  - Generate code_challenge from verifier
  - Send code_challenge in authorization request
  - Send code_verifier in token exchange request
  - Verify implementation matches RFC 7636

- [x] 4.3 Implement one-time authorization code validation
  - Verify authorization code is used only once
  - Track used codes or use Google's built-in one-time enforcement
  - Reject duplicate code exchanges
  - Test with same code exchanged twice

- [x] 4.4 Implement automatic token refresh mechanism
  - Check token expiry before any Google API call
  - Trigger refresh if expires within 5 minutes
  - Update stored token on successful refresh
  - Handle refresh failure (mark disconnected)
  - Log refresh events without exposing tokens

- [x] 4.5 Implement token logging without exposure
  - Verify tokens never appear in logs, error messages, or API responses
  - Use token IDs or placeholders in logs: "[TOKEN REDACTED]"
  - Create helper function for safe token logging
  - Add test to verify compliance

- [x] 4.6 Implement audit logging for Google OAuth operations
  - Log user connected, disconnected, token refreshed events
  - Log failed attempts (code exchange, refresh, revocation)
  - Include timestamp, user_id, event type
  - Never include token values or sensitive data
  - Store audit logs in database or external service

- [x] 4.7 Verify HTTPS enforcement
  - Ensure all OAuth endpoints require HTTPS in production
  - Verify redirect_uri always uses https:// in production
  - Test that HTTP requests are rejected in production

---

## Phase 5: Testing - Unit Tests

- [x] 5.1 Test GoogleAuthButton component
  - Render with all modes (login, signup, connect)
  - Verify button text varies by mode
  - Verify onClick triggers authorization
  - Verify loading state displays spinner
  - Verify error state shows error alert

- [x] 5.2 Test GoogleAccountStatus component
  - Render connected state: shows profile, disconnect button
  - Render disconnected state: shows connect button
  - Verify last_token_refresh_at displays correctly

- [x] 5.3 Test GoogleDisconnectDialog component
  - Dialog opens/closes correctly
  - Confirm button disabled for 2 seconds initially
  - Confirm button calls onConfirm with correct params
  - Cancel button calls onCancel

- [x] 5.4 Test token-encryption.service
  - Encrypt token, decrypt, verify matches original (round-trip)
  - Test with various token lengths (50-2000 chars)
  - Verify IVs are random (different for each encryption)
  - Verify encrypted output is Base64 encoded

- [x] 5.5 Test oauth-state.service
  - Generate state: verify randomness and length
  - Store and retrieve state: verify contents
  - Validate valid state: returns true
  - Validate expired state: returns false
  - Validate mismatched state: returns false

- [x] 5.6 Test Google OAuth API client
  - Mock Google endpoints
  - Test exchangeCodeForTokens with valid/invalid codes
  - Test refreshAccessToken with valid/invalid refresh tokens
  - Test revokeToken success/failure

- [x] 5.7 Test POST /api/auth/google/authorize endpoint
  - Generate authorization URL with all required parameters
  - Verify client_id, redirect_uri, scope, state, code_challenge in URL
  - Verify redirect_path parameter is optional
  - Verify connect_mode parameter is optional
  - Test error: invalid parameters

- [x] 5.8 Test GET /api/auth/google/callback endpoint
  - Mock Google code exchange
  - Test successful flow: new user created, tokens stored, session created
  - Test existing user: login without creating new user
  - Test connect mode: email must match
  - Test error: code invalid
  - Test error: state mismatch (CSRF protection)
  - Test error: state expired
  - Test error: email mismatch on connect

- [x] 5.9 Test POST /api/auth/google/disconnect endpoint
  - Mock Google revoke endpoint
  - Test successful disconnect: tokens deleted, is_connected = false
  - Test error: user not authenticated
  - Test error: no Google account connected
  - Verify audit log created

- [x] 5.10 Test POST /api/auth/google/token/refresh endpoint
  - Test token not expiring soon: return current expiry, no refresh
  - Test token expiring within 5 min: trigger refresh
  - Mock successful refresh: verify new token stored
  - Mock refresh failure with 401: verify is_connected = false
  - Test error: user not authenticated
  - Test error: no Google account connected

- [x] 5.11 Test google-auth.service functions
  - Test generateAuthorizationUrl: correct URL with params
  - Test encryptTokens/decryptTokens: round-trip
  - Test storeGoogleOAuth: creates database record
  - Test getUserGoogleOAuth: retrieves correct record
  - Test shouldRefreshToken: expires in 5min = true, else = false
  - Test disconnectGoogleAccount: tokens deleted, is_connected = false

- [x] 5.12 Test rate limiting
  - Make 10 requests in 60 seconds: all succeed
  - Make 11 requests in 60 seconds: 11th returns 429
  - Verify Retry-After header present
  - Test different IPs: rate limits per IP

---

## Phase 6: Testing - Property-Based Tests

- [x] 6.1 Property test: OAuth Authorization URL Generation
  - Generate: random redirect paths, environments
  - For each: call generateAuthorizationUrl
  - Verify: all required params present, state unique, scope unchanged
  - Tag: Feature: google-social-auth, Property 1: OAuth Authorization URL Generation
  - Configure: 100+ iterations

- [x] 6.2 Property test: Token Encryption Round Trip
  - Generate: random tokens (50-2000 char strings)
  - For each: encrypt then decrypt
  - Verify: decrypted == original
  - Tag: Feature: google-social-auth, Property 2: Token Encryption Round Trip
  - Configure: 100+ iterations

- [x] 6.3 Property test: Authorization Code Validation
  - Generate: valid codes (mock), invalid codes (random strings)
  - For each: call exchangeCodeForTokens
  - Verify: valid → credential with tokens, invalid → error
  - Tag: Feature: google-social-auth, Property 3: Authorization Code Validation
  - Configure: 100+ iterations

- [x] 6.4 Property test: Automatic Signup for New Google Users
  - Generate: random Google profiles (email, name, picture)
  - For each: call signup with new email
  - Verify: exactly one user created, email/name/picture match
  - Tag: Feature: google-social-auth, Property 4: Automatic Signup for New Google Users
  - Configure: 100+ iterations

- [x] 6.5 Property test: Email Matching for Connect Mode
  - Generate: existing user with email X, Google profiles with email Y
  - For each Y: call connect
  - Verify: Y == X → success, Y ≠ X → fail
  - Tag: Feature: google-social-auth, Property 5: Email Matching for Connect Mode
  - Configure: 100+ iterations

- [x] 6.6 Property test: Refresh Token Round Trip
  - Generate: tokens with various expiry times (past, soon, future)
  - For each: set up record, call refresh
  - Verify: expired → new token, stored, expiry updated
  - Tag: Feature: google-social-auth, Property 6: Refresh Token Round Trip
  - Configure: 100+ iterations

- [x] 6.7 Property test: Disconnect Token Cleanup
  - Generate: connected Google accounts
  - For each: call disconnect, mock revocation success
  - Verify: tokens deleted, is_connected = false
  - Tag: Feature: google-social-auth, Property 7: Disconnect Token Cleanup
  - Configure: 100+ iterations

- [x] 6.8 Property test: CSRF State Parameter Validation
  - Generate: authorization requests (create state), callbacks with matching/mismatched states
  - For each: call callback handler
  - Verify: matching → accepted, mismatched → rejected
  - Tag: Feature: google-social-auth, Property 8: CSRF State Parameter Validation
  - Configure: 100+ iterations

- [x] 6.9 Property test: Rate Limiting on Authentication Endpoints
  - Generate: rapid request sequences from same IP (100+/min)
  - For each: send request to auth endpoints
  - Verify: first N succeed (200), rest get 429
  - Tag: Feature: google-social-auth, Property 9: Rate Limiting on Authentication Endpoints
  - Configure: 50+ iterations (slower due to rate limiting)

- [x] 6.10 Property test: Multi-Auth Session Consistency
  - Generate: users with email auth, connect Google
  - For each: login email, logout, login Google, logout
  - Verify: both methods work independently, sessions valid
  - Tag: Feature: google-social-auth, Property 10: Multi-Auth Session Consistency
  - Configure: 100+ iterations

- [x] 6.11 Property test: Refresh Failure Disconnects Account
  - Generate: connected accounts, mock revoked tokens
  - For each: call refresh with invalid refresh token (401)
  - Verify: is_connected = false, user prompted to reconnect
  - Tag: Feature: google-social-auth, Property 11: Refresh Failure Disconnects Account
  - Configure: 100+ iterations

- [x] 6.12 Property test: Token Not Exposed in Logs
  - Generate: operations with tokens (encrypt, store, refresh, etc.)
  - For each: capture all logs
  - Verify: token strings do NOT appear in any log line
  - Tag: Feature: google-social-auth, Property 12: Token Not Exposed in Logs
  - Configure: 100+ iterations

---

## Phase 7: Integration Tests

> Implementado como testes de integração no nível de rotas/serviços, com o
> Google mockado (`tests/google-oauth.test.ts`). Não há execução de navegador
> real/E2E neste ambiente.

- [x] 7.1 Test end-to-end OAuth login flow
  - Navigate to login page
  - Verify "Continue with Google" button visible
  - Click button → verify redirected to Google Consent Screen (mock)
  - User authorizes → verify callback received
  - Verify tokens stored encrypted in database
  - Verify session created and user redirected to dashboard

- [x] 7.2 Test end-to-end signup with Google
  - Navigate to signup page
  - Click "Sign up with Google"
  - New Google account authorizes
  - Verify new Supabase user created with Google email
  - Verify tokens stored
  - Verify redirected to dashboard/onboarding

- [x] 7.3 Test connect Google to existing account
  - Login via email/password
  - Navigate to settings
  - Click "Connect Google"
  - Same email authorizes on Google
  - Verify tokens stored for user
  - Verify UI updated showing connected status
  - Verify user can now login with Google or email

- [x] 7.4 Test disconnect Google account
  - Connected user navigates to settings
  - Click "Disconnect Google"
  - Confirm disconnection
  - Verify revocation call to Google made
  - Verify tokens deleted from database
  - Verify UI updated showing disconnected status
  - Verify user still can login with email

- [x] 7.5 Test automatic token refresh
  - Set up connected user with token expiring in 3 minutes
  - Trigger operation requiring Google API call
  - Verify refresh automatically triggered
  - Verify new token stored in database
  - Verify original operation succeeds with new token

- [x] 7.6 Test error handling for various Google failures
  - Mock Google temporarily unavailable
  - Verify user sees error message
  - Verify can still login via email
  - Mock network timeout
  - Verify retry mechanism works

---

## Phase 8: Security & Documentation

- [x] 8.1 Security audit: Token storage and encryption
  - Verify tokens stored encrypted in database
  - Verify decryption works with correct key
  - Verify wrong key fails to decrypt
  - Verify tokens never in plain text in database

- [x] 8.2 Security audit: No token exposure
  - Check all code: no tokens in logs, error messages, API responses
  - Run grep for sensitive patterns: token, access_token, refresh_token
  - Verify all occurrences are safely redacted or used correctly

- [x] 8.3 Security audit: HTTPS enforcement
  - Verify production requires HTTPS
  - Verify redirect_uri uses https:// in production
  - Test HTTP redirect is blocked/redirected

- [x] 8.4 Update API documentation
  - Document all OAuth endpoints in README or API docs
  - Include request/response examples
  - Document error codes and recovery steps
  - Document environment variables needed

- [x] 8.5 Add environment setup documentation
  - Document how to set up Google Cloud OAuth app
  - Document how to get CLIENT_ID, CLIENT_SECRET
  - Document REDIRECT_URI setup
  - Include .env.example with all required vars

- [x] 8.6 Create TypeScript types export
  - Export all types from types/google-oauth.ts
  - Update types/index.ts to include new types
  - Ensure types are available throughout app

- [x] 8.7 Add middleware/auth guard for OAuth endpoints
  - Ensure all OAuth endpoints validate input
  - Ensure rate limiting applied globally
  - Ensure error handling consistent across endpoints

---

## Phase 9: Demo & Deployment

- [ ] 9.1 Create demo/test credentials for development
  - **Bloqueado:** exige uma conta/projeto Google Cloud externo. O
    `.env.example` já contém todas as variáveis e o passo a passo está em
    `docs/google-social-authentication.md`.
  - Set up test Google Cloud project
  - Create test OAuth credentials
  - Update .env.example with test values
  - Document how to test locally

- [ ] 9.2 Test in staging environment
  - **Bloqueado:** exige um ambiente de staging com deploy e credenciais
    Google reais. Os fluxos, rate limiting e erros são cobertos por testes
    automatizados com `fetch` mockado.
  - Deploy to staging
  - Test all flows (login, signup, connect, disconnect)
  - Verify rate limiting works
  - Verify error handling works

- [ ] 9.3 Verify production configuration
  - **Bloqueado:** depende de secrets e do Google Cloud Console de produção.
    Checklist detalhado em `docs/google-social-authentication.md`.
  - Production NEXT_PUBLIC_GOOGLE_CLIENT_ID set correctly
  - Production GOOGLE_CLIENT_SECRET set in secrets
  - Production REDIRECT_URI configured in Google Cloud
  - Production database migration applied

- [x] 9.4 Final acceptance tests
  - Coberto por `tests/google-oauth.test.ts` (integração 7.1–7.6) e
    `tests/google-oauth-properties.test.ts` com o Google mockado; login,
    cadastro, connect, disconnect e reconexão foram verificados.
  - Login with Google as new user
  - Login with Google as existing user
  - Signup with Google as new user
  - Connect Google to existing email account
  - Disconnect Google
  - Verify all features working as per requirements

