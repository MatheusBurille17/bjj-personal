# Implementation Plan: Authentication and Profiles

## Overview

This implementation plan establishes the authentication and profile management foundation for the Jiu-Jitsu lessons platform. The module uses Supabase Auth for identity management, PostgreSQL Row Level Security (RLS) for authorization, and Next.js API routes for server-side logic. Implementation follows a bottom-up approach: database layer Ã¢â€ â€™ service layer Ã¢â€ â€™ API layer Ã¢â€ â€™ frontend components.

**Key Technologies:**
- Next.js 14+ with TypeScript and App Router
- Supabase Auth for authentication
- PostgreSQL with RLS policies for data isolation
- Supabase Storage for avatar files
- Resend for email delivery
- shadcn/ui for UI components
- fast-check for property-based testing

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create profiles table migration
    - Create `supabase/migrations/[timestamp]_create_profiles_table.sql`
    - Define profiles table: id (UUID, PK), full_name (TEXT), email (TEXT UNIQUE), avatar_url (TEXT nullable), created_at, updated_at
    - Add index on email column
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 1.5, 3.2, 3.6, 3.7_

  - [x] 1.2 Create teachers table migration
    - Create `supabase/migrations/[timestamp]_create_teachers_table.sql`
    - Define teachers table: id (UUID, PK, FK to profiles), display_name (TEXT), timezone (TEXT, default 'America/Sao_Paulo'), created_at, updated_at
    - Create trigger for auto-updating updated_at timestamp
    - _Requirements: 3.3, 3.4, 15.1_

  - [x] 1.3 Create RLS policies for profiles table
    - Create `supabase/migrations/[timestamp]_add_profiles_rls_policies.sql`
    - Enable RLS on profiles table
    - Policy: Users can view their own profile (SELECT)
    - Policy: Users can update their own profile (UPDATE)
    - Policy: System can insert profiles on signup (INSERT)
    - _Requirements: 8.5, 10.2, 10.7, 12.1_

  - [x] 1.4 Create RLS policies for teachers table
    - Create `supabase/migrations/[timestamp]_add_teachers_rls_policies.sql`
    - Enable RLS on teachers table
    - Policy: Teachers can view their own record (SELECT)
    - Policy: Teachers can update their own record (UPDATE)
    - Policy: Teachers can insert their own record (INSERT)
    - Policy: Students can view enrolled teachers' display info (SELECT, checking enrollments)
    - _Requirements: 9.4, 10.1, 10.7, 12.2_

  - [x] 1.5 Create database utility functions
    - Add update_updated_at_column() trigger function to auto-update updated_at timestamps
    - Test that trigger function works correctly
    - _Requirements: 3.7, 8.6, 9.6_

- [x] 2. Environment configuration and external service setup
  - [x] 2.1 Create environment configuration file
    - Create `lib/env.ts` with environment variable validation using Zod
    - Define required variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
    - Validate on app startup
    - _Requirements: None (infrastructure)_

  - [x] 2.2 Set up Supabase client instances
    - Create `lib/supabase/client.ts` for client-side Supabase instance
    - Create `lib/supabase/server.ts` for server-side Supabase instance with cookie handling
    - Create `lib/supabase/admin.ts` for admin operations using service role key
    - _Requirements: 4.6, 6.3, 10.6_

  - [x] 2.3 Set up Resend email client
    - Create `lib/resend/client.ts` with Resend SDK initialization
    - Create `lib/resend/templates.ts` with email template functions (invitation, password recovery)
    - Create `lib/resend/send.ts` with email sending helper functions
    - _Requirements: 7.3, 5.1, 5.2_

  - [x] 2.4 Set up Supabase Storage helpers
    - Create `lib/storage/supabase.ts` with avatar upload and delete functions
    - Implement file type validation (JPEG, PNG, WebP)
    - Implement file size validation (max 5MB)
    - Create `lib/storage/signed-urls.ts` for generating signed URLs
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.7_

- [x] 3. TypeScript type definitions
  - [x] 3.1 Create authentication types
    - Create `types/auth.ts`
    - Define User, UserProfile, TeacherProfile, UserRoles, Session, AuthResult interfaces
    - Define SignupData, ProfileUpdateData, InviteTokenData interfaces
    - Export all types from `types/index.ts`
    - _Requirements: 1.6, 3.2, 3.4, 4.3, 11.3_

  - [x] 3.2 Create API response types
    - Create `types/api.ts`
    - Define ApiResponse, ApiError, ValidationError, PaginationMeta types
    - Define error code constants
    - _Requirements: 1.7, 4.2, 10.4_

- [x] 4. Validation utilities
  - [x] 4.1 Create validation helper functions
    - Create `lib/utils/validation.ts`
    - Implement isValidEmail() using regex or library
    - Implement isValidPassword() checking minimum 8 characters
    - Implement isValidTimezone() checking against IANA timezone list
    - Implement isValidImageType() for avatar uploads
    - _Requirements: 1.2, 1.3, 9.7, 13.2, 15.2_

  - [x] 4.2 Create validation schemas with Zod
    - Define signupSchema, loginSchema, profileUpdateSchema using Zod
    - Define avatarUploadSchema for file validation
    - Define inviteTokenSchema
    - _Requirements: 1.2, 1.3, 3.5, 8.7, 9.3_

- [x] 5. Service layer - Authentication service
  - [x] 5.1 Implement createTeacherAccount function
    - Create `lib/services/auth.service.ts`
    - Implement createTeacherAccount(email, password, fullName, displayName, timezone)
    - Call Supabase Auth signUp with email and password
    - Create profile record in profiles table
    - Create teacher record in teachers table
    - Return AuthResult with user, session, profile, teacher_profile, roles
    - _Requirements: 1.1, 1.5, 1.6, 3.1, 3.3, 3.4_

  - [x]* 5.2 Write property test for createTeacherAccount
    - **Property 1: Valid Account Creation**
    - **Validates: Requirements 1.1, 1.5, 3.1, 3.3**
    - Test that any valid email/password creates authenticated user with profile and teacher records

  - [x] 5.3 Implement user authentication functions
    - Implement login(email, password) function
    - Implement logout() function to invalidate session
    - Implement refreshSession() to refresh access token
    - _Requirements: 4.1, 4.3, 6.2, 6.7_

  - [x]* 5.4 Write property test for authentication
    - **Property 4: Session Creation on Successful Authentication**
    - **Validates: Requirements 1.6, 4.1**
    - Test that any successful auth returns valid session with tokens and expiration

  - [x] 5.5 Implement password recovery functions
    - Implement requestPasswordRecovery(email) function
    - Call Supabase Auth resetPasswordForEmail
    - Send recovery email via Resend
    - Never reveal whether email exists in system
    - _Requirements: 5.1, 5.2, 5.6_

  - [x] 5.6 Implement role detection function
    - Implement getUserRoles(userId) function
    - Query teachers table to check is_teacher
    - Query enrollments table to check is_student
    - Return UserRoles object
    - _Requirements: 11.1, 11.2, 11.3, 11.7_

  - [x]* 5.7 Write property test for role detection
    - **Property 25: Role Detection for Teachers**
    - **Validates: Requirements 11.1**
    - Test that any user with teacher record has is_teacher: true

- [x] 6. Service layer - Invitation service
  - [x] 6.1 Implement invite token generation
    - Create `lib/services/enrollment.service.ts`
    - Implement generateInviteToken() to create secure random token
    - Implement createEnrollmentWithInvite(teacherId, studentEmail)
    - Store token with expiration timestamp
    - _Requirements: 7.1, 7.2_

  - [x]* 6.2 Write property test for invite token generation
    - **Property 11: Invite Token Generation**
    - **Validates: Requirements 7.2**
    - Test that any enrollment creation generates secure token

  - [x] 6.3 Implement invite token validation
    - Implement verifyInviteToken(token) function
    - Check token exists and not expired
    - Return InviteTokenData with teacher name and student email
    - _Requirements: 7.4, 7.7_

  - [x]* 6.4 Write property test for invite token validation
    - **Property 12: Invite Token Validation**
    - **Validates: Requirements 7.4, 7.7**
    - Test that any expired/invalid token fails validation

  - [x] 6.5 Implement student account creation
    - Implement createStudentAccount(inviteToken, password, fullName) function
    - Verify invite token is valid
    - Create Supabase Auth user account
    - Create profile record
    - Update enrollment status to 'active' and link student_id
    - Send invitation email via Resend
    - _Requirements: 7.5, 7.6, 7.3_

  - [x]* 6.6 Write property test for student enrollment activation
    - **Property 13: Enrollment Activation on Student Signup**
    - **Validates: Requirements 7.6**
    - Test that any student signup with valid token activates enrollment

- [x] 7. Service layer - Profile service
  - [x] 7.1 Implement profile retrieval functions
    - Create `lib/services/profile.service.ts`
    - Implement getProfile(userId) to fetch profile data
    - Implement getTeacherProfile(userId) to fetch teacher data
    - Join both for complete teacher profile view
    - _Requirements: 8.1, 9.1_

  - [x]* 7.2 Write property test for profile retrieval
    - **Property 14: Profile Data Retrieval for Authenticated Users**
    - **Validates: Requirements 8.1**
    - Test that any authenticated user can retrieve own profile

  - [x] 7.3 Implement profile update function
    - Implement updateProfile(userId, data: ProfileUpdateData)
    - Update profiles table for full_name and avatar_url
    - Update teachers table for display_name and timezone if user is teacher
    - Validate required fields
    - Return updated profile data
    - _Requirements: 8.3, 9.2, 9.5_

  - [x]* 7.4 Write property test for profile updates
    - **Property 20: Teacher Profile Dual Table Update**
    - **Validates: Requirements 9.5**
    - Test that any teacher profile update affects both profiles and teachers tables

  - [x] 7.5 Implement avatar upload function
    - Implement uploadAvatar(userId, file) function
    - Validate file type and size
    - Upload to Supabase Storage in avatars bucket
    - Generate public or signed URL
    - Update profile avatar_url
    - Delete old avatar file if exists
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.7_

  - [x]* 7.6 Write property tests for avatar upload
    - **Property 31: Avatar File Type Validation**
    - **Property 32: Avatar File Size Validation**
    - **Property 35: Old Avatar Cleanup**
    - **Validates: Requirements 13.2, 13.3, 13.7**
    - Test file type validation, size validation, and cleanup

- [x] 8. Checkpoint - Service layer complete
  - Ensure all service functions are implemented
  - Run all property tests and unit tests
  - Verify database interactions work with local Supabase
  - Ask the user if questions arise

- [x] 9. API Routes - Authentication endpoints
  - [x] 9.1 Create POST /api/auth/signup endpoint
    - Create `app/api/auth/signup/route.ts`
    - Validate request body with signupSchema
    - Call auth.service createTeacherAccount
    - Return AuthResult or validation errors
    - Handle email already exists error (409)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 9.2 Write unit test for signup endpoint
    - Test successful teacher signup
    - Test duplicate email returns 409
    - Test invalid email returns 400
    - Test weak password returns 400

  - [x] 9.3 Create POST /api/auth/login endpoint
    - Create `app/api/auth/login/route.ts`
    - Validate request body with loginSchema
    - Call auth.service login function
    - Return session and profile data
    - Handle invalid credentials (401) without revealing email existence
    - _Requirements: 4.1, 4.2, 5.6_

  - [x]* 9.4 Write unit test for login endpoint
    - Test successful login with valid credentials
    - Test invalid credentials return 401
    - Test error message doesn't reveal email existence

  - [x] 9.5 Create POST /api/auth/logout endpoint
    - Create `app/api/auth/logout/route.ts`
    - Verify session exists
    - Call auth.service logout function
    - Invalidate session in Supabase Auth
    - Clear session cookie
    - Return success response
    - _Requirements: 6.2, 6.3_

  - [x] 9.6 Create POST /api/auth/refresh endpoint
    - Create `app/api/auth/refresh/route.ts`
    - Extract refresh token from request
    - Call Supabase Auth refreshSession
    - Return new access token and refresh token
    - Handle invalid refresh token (401)
    - _Requirements: 6.1, 6.7_

  - [x] 9.7 Create POST /api/auth/recover endpoint
    - Create `app/api/auth/recover/route.ts`
    - Validate email in request body
    - Call auth.service requestPasswordRecovery
    - Return generic success message regardless of email existence
    - Send recovery email via Resend
    - _Requirements: 5.1, 5.2, 5.6_

- [x] 10. API Routes - Invitation endpoints
  - [x] 10.1 Create GET /api/auth/invite/[token]/route.ts endpoint
    - Validate invite token from URL params
    - Call enrollment.service verifyInviteToken
    - Return invitation details (teacher name, student email)
    - Return 404 for invalid or expired tokens
    - _Requirements: 7.4, 7.7_

  - [x] 10.2 Create POST /api/auth/invite/[token]/route.ts endpoint
    - Validate token and request body (password, fullName)
    - Call enrollment.service createStudentAccount
    - Return AuthResult with student session
    - Return 404 for invalid tokens
    - _Requirements: 7.5, 7.6_

  - [x]* 10.3 Write integration test for invitation flow
    - Test complete flow: create enrollment Ã¢â€ â€™ generate token Ã¢â€ â€™ validate token Ã¢â€ â€™ create student account
    - Verify enrollment status changes to active
    - Verify student can login after signup

- [x] 11. API Routes - Profile endpoints
  - [x] 11.1 Create GET /api/profiles/me endpoint
    - Create `app/api/profiles/me/route.ts`
    - Verify user is authenticated (check session)
    - Return 401 if not authenticated
    - Call profile.service getProfile with user ID from session
    - Include teacher profile if user is teacher
    - Include roles (is_teacher, is_student)
    - _Requirements: 8.1, 9.1, 10.3_

  - [x]* 11.2 Write property test for profile endpoint authorization
    - **Property 10: Protected Route Authorization**
    - **Validates: Requirements 4.6, 6.4, 10.3**
    - Test that any unauthenticated request returns 401

  - [x] 11.3 Create PATCH /api/profiles/me endpoint
    - Verify user is authenticated
    - Validate request body with profileUpdateSchema
    - Call profile.service updateProfile with user ID and data
    - Return updated profile data
    - Validate timezone if provided
    - _Requirements: 8.3, 8.7, 9.2, 9.3, 9.7_

  - [x]* 11.4 Write property test for timezone validation
    - **Property 21: Timezone Validation**
    - **Validates: Requirements 9.7, 15.2**
    - Test that any invalid IANA timezone is rejected

  - [x] 11.4 Create POST /api/storage/avatar/upload endpoint
    - Create `app/api/storage/avatar/upload/route.ts`
    - Verify user is authenticated
    - Parse multipart form data to extract file
    - Validate file type and size
    - Call profile.service uploadAvatar
    - Return avatar URL
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 12. API Routes - Teacher profile endpoints
  - [x] 12.1 Create GET /api/teachers/[id]/route.ts endpoint
    - Verify user is authenticated
    - Extract teacher ID from URL params
    - Check authorization: user is the teacher OR user is enrolled student
    - Call teacher.service getTeacherPublicProfile
    - Return display_name and avatar_url only (no internal config)
    - Return 403 if user not authorized
    - _Requirements: 12.2, 12.5, 10.4_

  - [x]* 12.2 Write property test for teacher data isolation
    - **Property 29: Teacher Configuration Hidden from Students**
    - **Validates: Requirements 12.2, 12.5**
    - Test that student requests never include timezone or internal fields

- [x] 13. Middleware for authentication
  - [x] 13.1 Create Next.js middleware for session verification
    - Create `middleware.ts` in project root
    - Check Supabase session on protected routes
    - Redirect unauthenticated users to /login
    - Allow public routes (login, signup, invite pages)
    - Set user context for downstream handlers
    - _Requirements: 6.4, 6.5_

  - [x] 13.2 Create authentication middleware helper
    - Create `lib/middleware/auth.ts`
    - Implement withAuth() HOF to wrap API routes
    - Extract and verify session from cookies or headers
    - Inject user into request context
    - Return 401 if session invalid
    - _Requirements: 4.6, 10.3, 10.6_

- [x] 14. Error handling utilities
  - [x] 14.1 Create error handling helpers
    - Create `lib/middleware/errors.ts`
    - Implement ApiError class with code and message
    - Implement error response formatter
    - Implement validation error formatter for Zod errors
    - Map common Supabase errors to API errors
    - _Requirements: 1.7, 4.2, 10.4_

  - [x] 14.2 Create security-aware error handlers
    - Ensure password hashes never exposed in errors
    - Ensure auth errors don't reveal email existence
    - Sanitize database errors before sending to client
    - Log errors with request ID for debugging
    - _Requirements: 5.6, 14.2_

- [x] 15. Checkpoint - API layer complete
  - Run all API endpoint tests
  - Verify authentication flow works end-to-end
  - Test RLS policies block unauthorized access
  - Verify error responses follow standard format
  - Ask the user if questions arise

- [x] 16. Frontend - Authentication components
  - [x] 16.1 Install shadcn/ui components
    - Run `npx shadcn-ui@latest add button input label form card alert`
    - Verify components installed to `components/ui/`

  - [x] 16.2 Create LoginForm component
    - Create `components/auth/LoginForm.tsx` as client component
    - Use shadcn/ui Form, Input, Button components
    - Implement form with email and password fields
    - Add client-side validation
    - Call POST /api/auth/login on submit
    - Display error messages
    - Redirect to dashboard on success
    - Include link to password recovery
    - _Requirements: 4.1, 4.2_

  - [x] 16.3 Create SignupForm component
    - Create `components/auth/SignupForm.tsx` as client component
    - Form fields: email, password, full_name, display_name, timezone
    - Use shadcn/ui Form components with Zod validation
    - Call POST /api/auth/signup on submit
    - Display validation errors inline
    - Redirect to dashboard on success
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 16.4 Create PasswordRecoveryForm component
    - Create `components/auth/PasswordRecoveryForm.tsx`
    - Single email input field
    - Call POST /api/auth/recover on submit
    - Display success message (generic, don't reveal email existence)
    - _Requirements: 5.1, 5.6_

- [x] 17. Frontend - Profile management components
  - [x] 17.1 Create ProfileForm component
    - Create `components/auth/ProfileForm.tsx` as client component
    - Editable fields: full_name, display_name (teachers), timezone (teachers)
    - Use shadcn/ui Form components
    - Call PATCH /api/profiles/me on submit
    - Display success message and errors
    - _Requirements: 8.3, 9.2_

  - [x] 17.2 Create AvatarUpload component
    - Create `components/auth/AvatarUpload.tsx` as client component
    - Image preview with current avatar
    - File input with drag-and-drop support
    - Client-side validation (file type, size)
    - Upload progress indicator
    - Call POST /api/storage/avatar/upload
    - Update profile with new avatar URL
    - Remove avatar button
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.7_

  - [x] 17.3 Create TimezoneSelector component
    - Create `components/auth/TimezoneSelector.tsx`
    - Use shadcn/ui Select component
    - List common timezones (at least 20 options)
    - Search/filter functionality
    - Display current selection
    - _Requirements: 15.1, 15.2, 15.5_

- [x] 18. Frontend - Authentication pages
  - [x] 18.1 Create login page
    - Create `app/(auth)/login/page.tsx` as server component
    - Render LoginForm component
    - Add link to signup page
    - Redirect if already authenticated
    - _Requirements: 4.1_

  - [x] 18.2 Create signup page
    - Create `app/(auth)/signup/page.tsx` as server component
    - Render SignupForm component
    - Add link to login page
    - Redirect if already authenticated
    - _Requirements: 1.1_

  - [x] 18.3 Create password recovery page
    - Create `app/(auth)/recover/page.tsx`
    - Render PasswordRecoveryForm component
    - Add back to login link
    - _Requirements: 5.1_

  - [x] 18.4 Create student invitation page
    - Create `app/(auth)/invite/[token]/page.tsx`
    - Verify token with GET /api/auth/invite/[token]
    - Display teacher name and student email
    - Render signup form for student (simplified, no display_name/timezone)
    - Call POST /api/auth/invite/[token] on submit
    - Display error if token invalid or expired
    - _Requirements: 7.4, 7.5, 7.7_

- [x] 19. Frontend - Profile pages
  - [x] 19.1 Create teacher settings page
    - Create `app/(teacher)/settings/page.tsx`
    - Fetch profile data from GET /api/profiles/me
    - Render ProfileForm and AvatarUpload components
    - Protected by middleware (teacher role required)
    - _Requirements: 9.1, 9.2_

  - [x] 19.2 Create student profile page
    - Create `app/(student)/profile/page.tsx`
    - Fetch profile data from GET /api/profiles/me
    - Render ProfileForm (without display_name/timezone) and AvatarUpload
    - Protected by middleware (student role required)
    - _Requirements: 8.1, 8.3_

- [x] 20. Custom hooks for client state management
  - [x] 20.1 Create useAuth hook
    - Create `hooks/useAuth.ts`
    - Manage auth state (user, profile, loading)
    - Provide login, signup, logout functions
    - Auto-refresh tokens before expiration
    - Sync with Supabase Auth state changes
    - _Requirements: 4.1, 4.3, 6.1, 6.7_

  - [x] 20.2 Create useProfile hook
    - Create `hooks/useProfile.ts`
    - Fetch profile data from GET /api/profiles/me
    - Provide updateProfile function
    - Provide uploadAvatar function
    - Handle loading and error states
    - _Requirements: 8.1, 8.3, 13.4_

- [x] 21. Property-based tests for data isolation
  - [x]* 21.1 Write property test for profile data isolation
    - **Property 16: Profile Data Isolation Between Students**
    - **Validates: Requirements 8.5, 10.2**
    - Test that any two students cannot access each other's profiles

  - [x]* 21.2 Write property test for teacher data isolation
    - **Property 22: Profile Data Isolation Between Teachers**
    - **Validates: Requirements 9.4, 10.1, 12.1**
    - Test that any two teachers cannot access each other's data

  - [x]* 21.3 Write property test for RLS enforcement
    - **Property 24: RLS Policy Enforcement**
    - **Validates: Requirements 10.7, 12.6**
    - Test that direct database queries respect RLS policies

- [x] 22. Property-based tests for validation rules
  - [x]* 22.1 Write property test for email validation
    - **Property 2: Email Format Validation**
    - **Validates: Requirements 1.2**
    - Test that any invalid email format is rejected

  - [x]* 22.2 Write property test for password validation
    - **Property 3: Password Strength Validation**
    - **Validates: Requirements 1.3, 5.4**
    - Test that any password under 8 characters is rejected

  - [x]* 22.3 Write property test for required fields
    - **Property 7: Required Field Validation**
    - **Validates: Requirements 3.5, 9.3**
    - Test that requests missing required fields are rejected

- [x] 23. Property-based tests for timestamps and audit
  - [x]* 23.1 Write property test for timestamp updates
    - **Property 8: Timestamp Update on Modification**
    - **Validates: Requirements 3.7, 8.6, 9.6**
    - Test that any update increases updated_at timestamp

  - [x]* 23.2 Write property test for UTC storage
    - **Property 39: UTC Timestamp Storage**
    - **Validates: Requirements 15.7**
    - Test that all timestamps stored in UTC

- [x] 24. Property-based tests for security
  - [x]* 24.1 Write property test for unauthorized access
    - **Property 23: Unauthorized Access Returns 403**
    - **Validates: Requirements 10.4**
    - Test that any unauthorized access returns 403

  - [x]* 24.2 Write property test for password hash exposure
    - **Property 36: Password Hash Never Exposed**
    - **Validates: Requirements 14.2**
    - Test that no API response contains password hashes

- [x] 25. Integration tests for complete flows
  - [x]* 25.1 Write integration test for teacher signup flow
    - Test: signup Ã¢â€ â€™ email confirmation Ã¢â€ â€™ login Ã¢â€ â€™ profile setup
    - Verify all database records created correctly
    - Verify session management works

  - [x]* 25.2 Write integration test for student invitation flow
    - Test: create enrollment Ã¢â€ â€™ send invite Ã¢â€ â€™ verify token Ã¢â€ â€™ student signup Ã¢â€ â€™ enrollment activation
    - Verify enrollment status changes
    - Verify student can login

  - [x]* 25.3 Write integration test for password recovery flow
    - Test: request recovery Ã¢â€ â€™ receive email Ã¢â€ â€™ reset password Ã¢â€ â€™ login with new password
    - Verify old sessions invalidated

  - [x]* 25.4 Write integration test for avatar upload flow
    - Test: upload avatar Ã¢â€ â€™ verify URL returned Ã¢â€ â€™ fetch profile Ã¢â€ â€™ see avatar URL Ã¢â€ â€™ update avatar Ã¢â€ â€™ old file deleted

- [x] 26. Unit tests for edge cases
  - [x]* 26.1 Write unit tests for error scenarios
    - Test duplicate email returns 409
    - Test invalid credentials return 401 without revealing email
    - Test expired session returns 401
    - Test invalid timezone returns 400
    - Test oversized avatar returns 400
    - Test invalid file type returns 400

  - [x]* 26.2 Write unit tests for boundary conditions
    - Test password exactly 8 characters (valid)
    - Test password 7 characters (invalid)
    - Test avatar exactly 5MB (valid)
    - Test avatar 5MB + 1 byte (invalid)
    - Test empty full_name (invalid)

- [x] 27. RLS policy verification tests
  - [x]* 27.1 Write direct database test for profile RLS
    - Create two users
    - Attempt to query other user's profile with authenticated client
    - Verify no data returned
    - _Requirements: 10.7, 12.6_

  - [x]* 27.2 Write direct database test for teacher RLS
    - Create two teachers
    - Attempt to query other teacher's record
    - Verify no data returned
    - Verify students can see enrolled teacher display info only

- [x] 28. Final checkpoint - Complete implementation verification
  - Run full test suite (unit + property + integration)
  - Verify all 39 correctness properties pass
  - Verify test coverage Ã¢â€°Â¥ 80%
  - Test complete flows manually in browser
  - Verify error messages are user-friendly
  - Verify no security issues (password hashes, email enumeration)
  - Ask the user if questions arise

- [x] 29. Documentation and cleanup
  - [x] 29.1 Add code comments to complex functions
    - Add JSDoc comments to all exported functions
    - Document expected input/output for services
    - Document error scenarios

  - [x] 29.2 Create .env.example file
    - List all required environment variables
    - Include example values (not real credentials)
    - Add comments explaining each variable
    - _Requirements: None (developer experience)_

  - [x] 29.3 Update README with setup instructions
    - Document how to run migrations
    - Document how to start local Supabase
    - Document how to run tests
    - List required environment variables

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- RLS policies are tested both through API endpoints and direct database queries
- All timestamps stored in UTC regardless of user timezone preference
- Error messages must never reveal email existence (security requirement)
- Avatar cleanup on update prevents storage bloat
- Session refresh should happen automatically before token expiration
