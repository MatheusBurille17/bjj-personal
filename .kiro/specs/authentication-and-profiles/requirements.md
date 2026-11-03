# Requirements Document: Authentication and Profiles

## Introduction

This document defines the requirements for the Authentication and Profiles module of a Jiu-Jitsu private lessons management platform. This foundational module enables secure user authentication, profile management, and role-based access control for teachers and students. The system uses Supabase Auth as the authentication provider and enforces strict data isolation through Row Level Security policies.

The module establishes the security foundation upon which all other platform features depend, ensuring that teachers can only access their own data and students can only view content they are authorized to see.

## Glossary

- **Auth_System**: Supabase Auth service responsible for authentication operations
- **Profile**: User account record containing basic user information
- **Teacher_Profile**: Extended profile with teacher-specific configuration
- **Student**: User with student role capabilities
- **Teacher**: User with teacher role capabilities
- **Enrollment**: Relationship record linking a student to a teacher (defined in separate spec)
- **Session**: Authenticated user session managed by Supabase Auth
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Invite_Token**: Secure token sent to students for account creation
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **Client**: Frontend application code
- **Server**: Backend application code (API routes, server components)

## Requirements

### Requirement 1: Teacher Account Creation

**User Story:** As a new teacher, I want to create an account with email and password, so that I can access the platform and manage my students.

#### Acceptance Criteria

1. WHEN a teacher provides valid email and password, THE Auth_System SHALL create an authenticated user account
2. THE Auth_System SHALL validate that the email format is correct before account creation
3. THE Auth_System SHALL validate that the password meets minimum security requirements (at least 8 characters)
4. WHEN the email is already registered, THE Auth_System SHALL return a descriptive error message
5. WHEN account creation succeeds, THE Database SHALL automatically create a corresponding Profile record
6. WHEN account creation succeeds, THE Auth_System SHALL return a valid Session
7. IF account creation fails, THEN THE API_Route SHALL return an error code and message

### Requirement 2: Email Confirmation

**User Story:** As a platform administrator, I want new teacher accounts to confirm their email addresses, so that we can verify account ownership.

#### Acceptance Criteria

1. WHEN email confirmation is enabled, THE Auth_System SHALL send a confirmation email after account creation
2. THE confirmation email SHALL contain a secure verification link with limited validity
3. WHEN a teacher clicks the verification link, THE Auth_System SHALL mark the email as confirmed
4. WHILE the email is unconfirmed, THE Platform SHALL allow the teacher to access their account
5. THE Auth_System SHALL provide functionality to resend confirmation emails
6. WHEN the confirmation link expires, THE Auth_System SHALL allow requesting a new confirmation email

### Requirement 3: Teacher Profile Creation

**User Story:** As a newly registered teacher, I want to complete my profile with my name and display settings, so that students can identify me properly.

#### Acceptance Criteria

1. WHEN a teacher account is created, THE Database SHALL create a Profile record with the user ID
2. THE Profile SHALL store full name, email, and optional avatar URL
3. WHEN a Profile is created for a teacher, THE Database SHALL create a corresponding Teacher_Profile record
4. THE Teacher_Profile SHALL store display name and timezone
5. THE API_Route SHALL validate that full name and display name are provided before saving
6. THE Database SHALL record creation and update timestamps automatically
7. WHEN a teacher updates their profile, THE Database SHALL update the updated_at timestamp

### Requirement 4: User Authentication

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my account securely.

#### Acceptance Criteria

1. WHEN a user provides valid credentials, THE Auth_System SHALL create an authenticated Session
2. WHEN credentials are invalid, THE Auth_System SHALL return an authentication error
3. THE Auth_System SHALL use JWT tokens for session management
4. THE Session SHALL remain valid according to Supabase Auth token expiration settings
5. WHEN a Session expires, THE Auth_System SHALL require re-authentication
6. THE API_Route SHALL verify the Session server-side before processing requests
7. THE Client SHALL store session tokens securely

### Requirement 5: Password Recovery

**User Story:** As a user who forgot their password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user requests password recovery, THE Auth_System SHALL send a password reset email
2. THE reset email SHALL contain a secure recovery link with limited validity
3. WHEN a user clicks the recovery link, THE Auth_System SHALL allow password change
4. THE Auth_System SHALL validate that the new password meets security requirements
5. WHEN password reset succeeds, THE Auth_System SHALL invalidate all existing sessions for that user
6. IF the email does not exist in the system, THE Auth_System SHALL not reveal this information to prevent user enumeration
7. WHEN the recovery link expires, THE User SHALL request a new recovery email

### Requirement 6: Session Management

**User Story:** As a logged-in user, I want my session to remain active while I use the platform, so that I don't have to re-authenticate frequently.

#### Acceptance Criteria

1. THE Auth_System SHALL automatically refresh tokens before expiration when the user is active
2. WHEN a user logs out, THE Auth_System SHALL invalidate the current Session
3. THE Client SHALL clear all session data when logout occurs
4. WHEN a Session is invalid or expired, THE Server SHALL return a 401 Unauthorized status
5. THE Client SHALL redirect unauthenticated users to the login page
6. THE Middleware SHALL verify Session validity on each protected route request
7. WHEN token refresh fails, THE Auth_System SHALL require user re-authentication

### Requirement 7: Student Invitation and Account Creation

**User Story:** As a teacher, I want to invite students by email so they can create accounts and access their training information.

#### Acceptance Criteria

1. WHEN a teacher creates an enrollment with a student email, THE Database SHALL create an enrollment record with pending status
2. THE Platform SHALL generate a secure Invite_Token for the enrollment
3. THE Platform SHALL send an invitation email containing the Invite_Token
4. WHEN a student clicks the invite link, THE Platform SHALL validate the Invite_Token
5. WHEN the token is valid, THE Platform SHALL allow the student to create an account or link an existing account
6. WHEN account creation succeeds, THE Database SHALL update the enrollment status to active
7. IF the Invite_Token is invalid or expired, THEN THE Platform SHALL display an error message

### Requirement 8: Student Profile Access

**User Story:** As a student, I want to view and edit my personal profile information, so that I can keep my details up to date.

#### Acceptance Criteria

1. WHEN a student is authenticated, THE API_Route SHALL return the student's Profile
2. THE Student SHALL be able to view their full name, email, and avatar
3. THE Student SHALL be able to update their full name and avatar URL
4. THE Student SHALL NOT be able to modify their email through profile editing
5. THE RLS_Policy SHALL prevent students from viewing or modifying profiles of other users
6. WHEN a student updates their profile, THE Database SHALL record the update timestamp
7. THE API_Route SHALL validate profile data before saving changes

### Requirement 9: Teacher Profile Management

**User Story:** As a teacher, I want to manage my profile settings including display name and timezone, so that my information is accurate for students and scheduling.

#### Acceptance Criteria

1. WHEN a teacher is authenticated, THE API_Route SHALL return both Profile and Teacher_Profile data
2. THE Teacher SHALL be able to update their full name, avatar URL, display name, and timezone
3. THE API_Route SHALL validate that display name and timezone are provided
4. THE RLS_Policy SHALL prevent teachers from viewing or modifying other teachers' profiles
5. WHEN a teacher updates their settings, THE Database SHALL update both Profile and Teacher_Profile records
6. THE Database SHALL maintain audit timestamps for all profile changes
7. THE API_Route SHALL return validation errors for invalid timezone values

### Requirement 10: Authorization Enforcement

**User Story:** As a platform operator, I want all data access to be validated server-side, so that users cannot access unauthorized data.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that teachers can only access their own Teacher_Profile
2. THE RLS_Policy SHALL enforce that students can only access their own Profile
3. THE API_Route SHALL verify user authentication before processing any request
4. WHEN a user attempts to access unauthorized data, THE Server SHALL return a 403 Forbidden status
5. THE Server SHALL never trust client-provided identifiers without verification
6. THE RLS_Policy SHALL use the authenticated user ID from the Session for authorization
7. THE Database SHALL reject queries that violate RLS policies

### Requirement 11: Role Identification

**User Story:** As the system, I need to identify whether a user has teacher or student capabilities, so that I can enforce role-based access control.

#### Acceptance Criteria

1. WHEN a user authenticates, THE Server SHALL determine if the user has a Teacher_Profile record
2. WHEN a user authenticates, THE Server SHALL determine if the user has any enrollment records as a student
3. THE API_Route SHALL return role information (is_teacher, is_student) with authentication response
4. THE Middleware SHALL use role information to route users to appropriate dashboards
5. THE System SHALL support users having both teacher and student capabilities simultaneously
6. WHEN a user has both roles, THE Platform SHALL allow switching between teacher and student views
7. THE RLS_Policy SHALL enforce permissions based on actual role relationships, not claimed roles

### Requirement 12: Data Privacy and Isolation

**User Story:** As a teacher, I want my student information and notes to remain private, so that other teachers cannot access my data.

#### Acceptance Criteria

1. THE RLS_Policy SHALL prevent teachers from querying other teachers' Profile or Teacher_Profile data
2. THE RLS_Policy SHALL prevent students from querying Teacher_Profile configuration data
3. WHEN a teacher views their students, THE RLS_Policy SHALL only return enrollments owned by that teacher
4. THE Database SHALL enforce data isolation at the row level for all profile tables
5. THE API_Route SHALL not expose internal teacher configuration to student endpoints
6. WHEN an unauthorized access attempt occurs, THE Database SHALL not return any data
7. THE RLS_Policy SHALL be tested to ensure no data leakage between teachers

### Requirement 13: Avatar Management

**User Story:** As a user, I want to upload a profile picture, so that my account is personalized and easily identifiable.

#### Acceptance Criteria

1. THE Platform SHALL support uploading images to Supabase Storage for avatars
2. THE API_Route SHALL validate that uploaded files are image types (JPEG, PNG, WebP)
3. THE API_Route SHALL validate that uploaded files do not exceed 5MB in size
4. WHEN an avatar upload succeeds, THE Platform SHALL generate a signed URL
5. THE Database SHALL store the avatar URL in the Profile record
6. THE Platform SHALL serve avatars through Supabase Storage with appropriate caching
7. WHEN a user updates their avatar, THE Platform SHALL delete the previous avatar file

### Requirement 14: Account Security

**User Story:** As a user, I want my account to be protected from unauthorized access, so that my data remains secure.

#### Acceptance Criteria

1. THE Auth_System SHALL hash and salt passwords before storage
2. THE Auth_System SHALL NOT expose password hashes through any API
3. THE Platform SHALL use HTTPS for all authentication requests
4. THE Session tokens SHALL be transmitted only through secure HTTP-only cookies or Authorization headers
5. THE Auth_System SHALL implement rate limiting on login and password reset attempts
6. WHEN multiple failed login attempts occur, THE Auth_System SHALL temporarily block the account
7. THE Platform SHALL log authentication events for security auditing

### Requirement 15: Timezone Handling

**User Story:** As a teacher, I want to set my timezone preference, so that all scheduling features use the correct time zone.

#### Acceptance Criteria

1. THE Teacher_Profile SHALL store the teacher's timezone in IANA timezone format
2. THE API_Route SHALL validate that the timezone value is a valid IANA timezone identifier
3. WHEN a teacher has not set a timezone, THE Platform SHALL use a sensible default (America/Sao_Paulo)
4. THE Server SHALL use the teacher's configured timezone for all date-time operations related to that teacher
5. THE API_Route SHALL return the teacher's timezone with profile data
6. THE Client SHALL display times in the user's configured timezone
7. THE Database SHALL store all timestamps in UTC regardless of user timezone

