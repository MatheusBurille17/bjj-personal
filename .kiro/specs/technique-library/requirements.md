# Requirements Document: Technique Library (Biblioteca de Técnicas)

## Introduction

This document defines the requirements for the Technique Library module of the Jiu-Jitsu private lessons management platform. This module enables teachers to organize their technical content library in a hierarchical structure (Techniques → Modules → Videos), allowing them to create, organize, and reuse videos across multiple lessons and monthly plans. Videos are hosted on external providers (Mux) with only metadata stored in the database.

The library serves as the central repository for all instructional content, enabling teachers to build a structured knowledge base that can be efficiently referenced and shared with students through explicit access controls. The hierarchical organization mirrors how Jiu-Jitsu instruction is typically structured, with broad techniques broken down into learning modules and specific video demonstrations.

## Glossary

- **Technique**: Top-level organizational unit representing a Jiu-Jitsu technique or technique category
- **Module**: Mid-level organizational unit within a technique, grouping related videos
- **Video**: Individual video file metadata record with external hosting reference
- **Teacher**: User with teacher role who creates and manages library content
- **Student**: User with student role who views authorized library content
- **Enrollment**: Relationship record linking a student to a teacher
- **Video_Provider**: External video hosting service (Mux)
- **Mux**: Video hosting and streaming service provider
- **Provider_Video_ID**: Unique identifier assigned by Mux to a video asset
- **Upload_URL**: Temporary URL provided by Mux for direct video uploads
- **Playback_URL**: Signed temporary URL for authorized video viewing
- **Video_Status**: Processing state of a video (uploading, processing, ready, error, archived)
- **Database**: PostgreSQL database managed by Supabase
- **API_Route**: Server-side endpoint for handling requests
- **RLS_Policy**: Row Level Security policy enforcing authorization at database level
- **Webhook**: HTTP callback from Mux to report video processing status
- **Sort_Order**: Integer field determining display sequence
- **Platform**: The complete application system
- **Monthly_Plan**: Pedagogical planning document (defined in separate spec)
- **Lesson**: Concrete class occurrence record (defined in separate spec)
- **Access_Control**: Module defining student permissions to view videos (separate spec)

## Requirements

### Requirement 1: Create Technique

**User Story:** As a teacher, I want to create techniques to organize my content library, so that I can structure my instructional materials hierarchically.

#### Acceptance Criteria

1. WHEN a teacher provides a technique name, THE Platform SHALL create a technique record owned by that teacher
2. THE API_Route SHALL validate that the technique name is not empty
3. THE technique record SHALL store name, description, sort_order, and status fields
4. THE Database SHALL set the status to active by default
5. THE Database SHALL set created_at and updated_at timestamps automatically
6. THE RLS_Policy SHALL enforce that the technique belongs to the authenticated teacher
7. THE description field SHALL be optional and nullable

### Requirement 2: List Techniques

**User Story:** As a teacher, I want to view all my techniques in order, so that I can navigate and manage my library structure.

#### Acceptance Criteria

1. WHEN a teacher requests their technique list, THE API_Route SHALL return all techniques where teacher_id matches the authenticated teacher
2. THE response SHALL include only active techniques by default
3. THE API_Route SHALL sort techniques by sort_order in ascending order
4. WHEN the teacher requests archived techniques, THE API_Route SHALL include techniques with archived status
5. THE RLS_Policy SHALL prevent teachers from viewing techniques owned by other teachers
6. WHEN no techniques exist, THE API_Route SHALL return an empty array
7. THE response SHALL include technique_id, name, description, sort_order, status, and module count for each technique

### Requirement 3: Update Technique

**User Story:** As a teacher, I want to edit technique information, so that I can keep my library organized and accurate.

#### Acceptance Criteria

1. WHEN a teacher updates a technique, THE API_Route SHALL allow modification of name, description, and sort_order fields
2. THE API_Route SHALL validate that name is not empty
3. THE RLS_Policy SHALL verify that the technique belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp automatically
5. WHEN the technique_id does not exist, THE API_Route SHALL return a 404 error
6. WHEN the technique belongs to a different teacher, THE API_Route SHALL return a 403 error
7. THE status field SHALL NOT be modifiable through the update endpoint

### Requirement 4: Reorder Techniques

**User Story:** As a teacher, I want to change the display order of techniques, so that I can organize my library logically.

#### Acceptance Criteria

1. WHEN a teacher provides new sort_order values for techniques, THE Database SHALL update the sort_order fields
2. THE API_Route SHALL accept an array of technique_id and sort_order pairs
3. THE RLS_Policy SHALL verify that all techniques belong to the authenticated teacher
4. THE API_Route SHALL validate that all sort_order values are positive integers
5. IF any technique_id does not belong to the teacher, THEN THE API_Route SHALL return a 403 error
6. THE Database SHALL update all sort_order values within a single transaction
7. WHEN the transaction fails, THE Database SHALL roll back all changes

### Requirement 5: Archive Technique

**User Story:** As a teacher, I want to archive techniques I no longer use, so that they don't clutter my active library but history is preserved.

#### Acceptance Criteria

1. WHEN a teacher archives a technique, THE Database SHALL update the status field to archived
2. THE Database SHALL set the archived status for all modules within the technique
3. THE Database SHALL set the archived status for all videos within those modules
4. THE RLS_Policy SHALL verify that the technique belongs to the authenticated teacher
5. THE Database SHALL update the updated_at timestamp
6. WHILE a technique is archived, THE technique SHALL not appear in default technique lists
7. THE archiving SHALL preserve all historical associations with lessons and plans

### Requirement 6: Unarchive Technique

**User Story:** As a teacher, I want to reactivate archived techniques, so that I can use them again when needed.

#### Acceptance Criteria

1. WHEN a teacher unarchives a technique, THE Database SHALL update the status field to active
2. THE Database SHALL NOT automatically unarchive modules and videos within the technique
3. THE RLS_Policy SHALL verify that the technique belongs to the authenticated teacher
4. THE API_Route SHALL only allow unarchiving of techniques with archived status
5. THE Database SHALL update the updated_at timestamp
6. IF the technique status is already active, THEN THE API_Route SHALL return a 409 conflict error
7. WHEN a technique is unarchived, THE technique SHALL appear in the active techniques list

### Requirement 7: Create Module Within Technique

**User Story:** As a teacher, I want to create modules within techniques, so that I can group related videos logically.

#### Acceptance Criteria

1. WHEN a teacher provides a module name and technique_id, THE Platform SHALL create a module record
2. THE API_Route SHALL validate that the technique_id exists and belongs to the authenticated teacher
3. THE module record SHALL store technique_id, name, description, sort_order, and status fields
4. THE Database SHALL set the status to active by default
5. THE Database SHALL set created_at and updated_at timestamps automatically
6. THE RLS_Policy SHALL enforce that the parent technique belongs to the authenticated teacher
7. THE description field SHALL be optional and nullable

### Requirement 8: List Modules for Technique

**User Story:** As a teacher, I want to view all modules within a technique, so that I can navigate the structure and manage content.

#### Acceptance Criteria

1. WHEN a teacher requests modules for a technique, THE API_Route SHALL return all modules where technique_id matches the requested technique
2. THE response SHALL include only active modules by default
3. THE API_Route SHALL sort modules by sort_order in ascending order
4. THE RLS_Policy SHALL verify that the parent technique belongs to the authenticated teacher
5. WHEN the teacher requests archived modules, THE API_Route SHALL include modules with archived status
6. WHEN no modules exist for the technique, THE API_Route SHALL return an empty array
7. THE response SHALL include module_id, name, description, sort_order, status, and video count for each module

### Requirement 9: Update Module

**User Story:** As a teacher, I want to edit module information, so that I can refine my content organization.

#### Acceptance Criteria

1. WHEN a teacher updates a module, THE API_Route SHALL allow modification of name, description, and sort_order fields
2. THE API_Route SHALL validate that name is not empty
3. THE RLS_Policy SHALL verify that the parent technique belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp automatically
5. WHEN the module_id does not exist, THE API_Route SHALL return a 404 error
6. WHEN the module belongs to a different teacher's technique, THE API_Route SHALL return a 403 error
7. THE status field SHALL NOT be modifiable through the update endpoint

### Requirement 10: Reorder Modules Within Technique

**User Story:** As a teacher, I want to change the display order of modules, so that I can present content in the optimal learning sequence.

#### Acceptance Criteria

1. WHEN a teacher provides new sort_order values for modules, THE Database SHALL update the sort_order fields
2. THE API_Route SHALL accept an array of module_id and sort_order pairs
3. THE RLS_Policy SHALL verify that all modules belong to techniques owned by the authenticated teacher
4. THE API_Route SHALL validate that all sort_order values are positive integers
5. IF any module belongs to a different teacher's technique, THEN THE API_Route SHALL return a 403 error
6. THE Database SHALL update all sort_order values within a single transaction
7. WHEN the transaction fails, THE Database SHALL roll back all changes

### Requirement 11: Archive Module

**User Story:** As a teacher, I want to archive modules I no longer use, so that my library stays organized without losing historical data.

#### Acceptance Criteria

1. WHEN a teacher archives a module, THE Database SHALL update the status field to archived
2. THE Database SHALL set the archived status for all videos within the module
3. THE RLS_Policy SHALL verify that the parent technique belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp
5. WHILE a module is archived, THE module SHALL not appear in default module lists
6. THE archiving SHALL preserve all historical video associations
7. THE API_Route SHALL allow archiving modules regardless of parent technique status

### Requirement 12: Move Module to Different Technique

**User Story:** As a teacher, I want to move a module to a different technique, so that I can reorganize my library as my teaching methodology evolves.

#### Acceptance Criteria

1. WHEN a teacher provides a module_id and new technique_id, THE Database SHALL update the technique_id field of the module
2. THE RLS_Policy SHALL verify that both the module and target technique belong to the authenticated teacher
3. THE API_Route SHALL validate that the target technique_id exists
4. THE Database SHALL update the updated_at timestamp
5. THE move operation SHALL preserve the module's status, videos, and other properties
6. IF either the module or technique belongs to a different teacher, THEN THE API_Route SHALL return a 403 error
7. THE Database SHALL update the module within a single transaction

### Requirement 13: Initiate Video Upload

**User Story:** As a teacher, I want to get an upload URL from Mux, so that I can upload video files directly to the video provider.

#### Acceptance Criteria

1. WHEN a teacher requests a video upload URL, THE API_Route SHALL create a direct upload in Mux
2. THE Mux service SHALL return an upload_url for client-side file upload
3. THE API_Route SHALL return the upload_url and an upload_id to the teacher
4. THE RLS_Policy SHALL verify the teacher is authenticated
5. THE upload_url SHALL expire after 24 hours if not used
6. THE API_Route SHALL NOT create a video record in the Database at this stage
7. WHEN Mux request fails, THE API_Route SHALL return a 500 error with descriptive message

### Requirement 14: Create Video Record with Metadata

**User Story:** As a teacher, I want to save video metadata after upload, so that the video appears in my library.

#### Acceptance Criteria

1. WHEN a teacher provides video metadata and module_id, THE Platform SHALL create a video record
2. THE video record SHALL store teacher_id, module_id, title, description, provider, provider_video_id, thumbnail_url, duration_seconds, and status fields
3. THE API_Route SHALL validate that the module_id exists and belongs to the authenticated teacher
4. THE API_Route SHALL validate that title is not empty
5. THE Database SHALL set status to uploading initially
6. THE Database SHALL set provider to "mux"
7. THE Database SHALL set created_at and updated_at timestamps automatically

### Requirement 15: Update Video Metadata

**User Story:** As a teacher, I want to edit video titles and descriptions, so that I can improve content discoverability and clarity.

#### Acceptance Criteria

1. WHEN a teacher updates a video, THE API_Route SHALL allow modification of title and description fields
2. THE API_Route SHALL validate that title is not empty
3. THE RLS_Policy SHALL verify that the video belongs to the authenticated teacher
4. THE Database SHALL update the updated_at timestamp automatically
5. WHEN the video_id does not exist, THE API_Route SHALL return a 404 error
6. WHEN the video belongs to a different teacher, THE API_Route SHALL return a 403 error
7. THE API_Route SHALL NOT allow modification of provider, provider_video_id, or status fields

### Requirement 16: Handle Mux Webhook for Processing Status

**User Story:** As the platform, I need to receive Mux webhook notifications, so that video processing status is updated automatically.

#### Acceptance Criteria

1. WHEN Mux sends a webhook notification, THE API_Route SHALL verify the webhook signature
2. WHEN the webhook event is "video.asset.ready", THE Database SHALL update the video status to ready
3. WHEN the webhook event is "video.asset.errored", THE Database SHALL update the video status to error
4. THE API_Route SHALL extract the provider_video_id from the webhook payload
5. THE Database SHALL update the video record matching the provider_video_id
6. THE Database SHALL store thumbnail_url and duration_seconds when provided by Mux
7. IF the webhook signature is invalid, THEN THE API_Route SHALL return a 401 error

### Requirement 17: List Videos for Module

**User Story:** As a teacher, I want to view all videos within a module, so that I can manage my video content.

#### Acceptance Criteria

1. WHEN a teacher requests videos for a module, THE API_Route SHALL return all videos where module_id matches the requested module
2. THE response SHALL exclude archived videos by default
3. THE RLS_Policy SHALL verify that the parent technique belongs to the authenticated teacher
4. THE response SHALL include video_id, title, description, thumbnail_url, duration_seconds, status, and created_at for each video
5. WHEN the teacher requests archived videos, THE API_Route SHALL include videos with archived status
6. WHEN no videos exist for the module, THE API_Route SHALL return an empty array
7. THE API_Route SHALL return videos regardless of processing status

### Requirement 18: Generate Signed Playback URL

**User Story:** As a teacher, I want to generate temporary video playback URLs, so that I can preview videos securely.

#### Acceptance Criteria

1. WHEN a teacher requests a playback URL for a video, THE API_Route SHALL verify the video belongs to the teacher
2. THE API_Route SHALL create a signed playback URL from Mux with 24-hour expiration
3. THE API_Route SHALL only generate URLs for videos with status "ready"
4. THE RLS_Policy SHALL verify that the video belongs to the authenticated teacher
5. WHEN the video status is not ready, THE API_Route SHALL return a 409 conflict error
6. WHEN the video_id does not exist, THE API_Route SHALL return a 404 error
7. THE signed URL SHALL use Mux secure playback policy

### Requirement 19: Archive Video

**User Story:** As a teacher, I want to archive videos I no longer use, so that they don't appear in my active library but associations are preserved.

#### Acceptance Criteria

1. WHEN a teacher archives a video, THE Database SHALL update the status field to archived
2. THE RLS_Policy SHALL verify that the video belongs to the authenticated teacher
3. THE Database SHALL update the updated_at timestamp
4. WHILE a video is archived, THE video SHALL not appear in default video lists
5. THE archiving SHALL preserve all historical associations with lessons and plans
6. THE API_Route SHALL allow archiving videos regardless of processing status
7. THE archived video SHALL remain accessible in historical lesson records

### Requirement 20: Search Videos Across All Modules

**User Story:** As a teacher, I want to search for videos by title, so that I can quickly find specific content across my entire library.

#### Acceptance Criteria

1. WHEN a teacher provides a search query, THE API_Route SHALL return videos where title contains the query string (case-insensitive)
2. THE search SHALL match partial strings anywhere in the title field
3. THE RLS_Policy SHALL enforce that only videos from the teacher's own techniques are searchable
4. THE search SHALL exclude archived videos by default
5. WHEN the search query is empty or whitespace only, THE API_Route SHALL return all non-archived videos
6. THE API_Route SHALL trim whitespace from the search query before matching
7. WHEN no videos match the search, THE API_Route SHALL return an empty array

### Requirement 21: Video Processing Status Visibility

**User Story:** As a teacher, I want to see video processing status, so that I know when videos are ready to use in lessons.

#### Acceptance Criteria

1. THE API_Route SHALL include the status field in all video responses
2. THE status field SHALL use one of these values: uploading, processing, ready, error, archived
3. WHILE a video status is uploading or processing, THE Platform SHALL display a processing indicator
4. WHILE a video status is error, THE Platform SHALL display an error message
5. WHEN a video status is ready, THE Platform SHALL allow generating playback URLs
6. THE API_Route SHALL prevent video association to lessons when status is not ready
7. THE status field SHALL be read-only for teacher update operations

### Requirement 22: Video Reusability Across Plans and Lessons

**User Story:** As a teacher, I want to use the same video in multiple lessons and plans, so that I don't need to upload duplicate content.

#### Acceptance Criteria

1. THE Database schema SHALL allow a single video to be referenced by multiple plan_day records
2. THE Database schema SHALL allow a single video to be referenced by multiple lesson records
3. THE API_Route SHALL NOT restrict video association based on existing references
4. WHEN a video is associated with lessons or plans, THE Platform SHALL NOT create copies of the video record
5. THE archiving of a video SHALL NOT automatically remove it from associated lessons or plans
6. THE RLS_Policy SHALL enforce teacher ownership when videos are associated with lessons or plans
7. THE historical lesson records SHALL maintain video associations even if the video is later archived

### Requirement 23: Prevent Video Deletion with References

**User Story:** As a platform operator, I want to prevent deletion of videos referenced by lessons or plans, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a teacher attempts to delete a video, THE API_Route SHALL check for associated lesson records
2. WHEN a teacher attempts to delete a video, THE API_Route SHALL check for associated plan_day records
3. IF references exist, THEN THE API_Route SHALL return a 409 conflict error with a message indicating archival is required
4. WHEN no references exist, THE Database SHALL allow deletion of the video record
5. THE deletion check SHALL include references of all types and statuses
6. THE RLS_Policy SHALL verify teacher ownership before allowing any deletion attempt
7. THE error message SHALL suggest archiving as the alternative action

### Requirement 24: Library Authorization Enforcement

**User Story:** As a platform operator, I want all library access to be strictly enforced, so that teachers cannot access other teachers' content.

#### Acceptance Criteria

1. THE RLS_Policy SHALL enforce that teachers can only query techniques where teacher_id equals their user ID
2. THE RLS_Policy SHALL enforce that module queries verify parent technique ownership
3. THE RLS_Policy SHALL enforce that video queries verify parent technique ownership through module relationship
4. THE API_Route SHALL verify teacher ownership before any create, update, or delete operation
5. WHEN a user attempts unauthorized access, THE Database SHALL return zero rows
6. THE RLS_Policy SHALL use auth.uid() to get the authenticated user ID from the JWT token
7. THE Database SHALL reject any query that violates RLS policies

### Requirement 25: Video Upload Flow Integrity

**User Story:** As a platform operator, I want the video upload process to maintain data integrity, so that incomplete uploads don't corrupt the library.

#### Acceptance Criteria

1. THE Platform SHALL require teacher authentication before providing Mux upload URLs
2. THE video record creation SHALL occur after the teacher confirms upload initiation
3. WHEN a video record is created with uploading status, THE record SHALL include the provider_video_id from Mux
4. THE webhook handler SHALL match incoming Mux notifications to existing video records by provider_video_id
5. IF a webhook arrives for a non-existent provider_video_id, THEN THE Platform SHALL log the event and return 200 status
6. THE Database SHALL maintain referential integrity between videos and modules
7. THE Platform SHALL NOT allow orphaned video records without a valid module_id

### Requirement 26: Hierarchical Library Data Integrity

**User Story:** As a platform operator, I want the hierarchical structure to maintain referential integrity, so that the library remains consistent.

#### Acceptance Criteria

1. THE Database SHALL enforce foreign key constraint between modules and techniques
2. THE Database SHALL enforce foreign key constraint between videos and modules
3. THE Database SHALL enforce foreign key constraint between videos and teachers
4. WHEN a technique is deleted, THE Database SHALL prevent deletion if active modules exist
5. WHEN a module is deleted, THE Database SHALL prevent deletion if active videos exist
6. THE deletion prevention SHALL consider only non-archived child records
7. THE error message SHALL indicate which child records prevent deletion

### Requirement 27: Library Timestamps and Audit Trail

**User Story:** As a platform operator, I want accurate timestamps on all library records, so that we can track content creation and modifications.

#### Acceptance Criteria

1. THE Database SHALL automatically set created_at to the current UTC timestamp when records are created
2. THE Database SHALL automatically update updated_at whenever records are modified
3. THE API_Route SHALL return all timestamp fields in ISO 8601 format with UTC timezone
4. THE Database SHALL use TIMESTAMPTZ type for all timestamp columns
5. THE updated_at field SHALL be updated when status changes occur
6. THE created_at field SHALL be immutable after record creation
7. THE timestamps SHALL be consistent across techniques, modules, and videos tables

### Requirement 28: Video Provider Integration Resilience

**User Story:** As a platform operator, I want the system to handle Mux service failures gracefully, so that temporary provider issues don't break the platform.

#### Acceptance Criteria

1. WHEN Mux API calls fail, THE Platform SHALL return descriptive error messages to the teacher
2. THE API_Route SHALL implement timeout handling for Mux requests with 30-second maximum
3. WHEN webhook processing fails, THE Platform SHALL log the error and return 200 status to prevent retries
4. THE Platform SHALL retry failed Mux API calls up to 3 times with exponential backoff
5. WHEN Mux is unavailable during upload URL request, THE API_Route SHALL return a 503 service unavailable error
6. THE video status SHALL remain in current state if webhook processing encounters errors
7. THE Platform SHALL not expose Mux API keys or secrets in any client-facing responses

### Requirement 29: Video Metadata Validation

**User Story:** As a teacher, I want to be notified of validation errors when entering video information, so that my library maintains quality standards.

#### Acceptance Criteria

1. THE API_Route SHALL validate that video title is not empty and contains at least 2 characters
2. THE API_Route SHALL validate that video title does not exceed 200 characters
3. THE API_Route SHALL validate that description does not exceed 2000 characters if provided
4. THE API_Route SHALL validate that module_id is a valid UUID format
5. THE API_Route SHALL trim whitespace from title and description fields before validation
6. WHEN validation fails, THE API_Route SHALL return a 400 error with field-specific error messages
7. THE API_Route SHALL validate input on both create and update operations

### Requirement 30: Library Content Pagination

**User Story:** As a teacher with extensive content, I want paginated library lists, so that the interface remains responsive with large libraries.

#### Acceptance Criteria

1. THE API_Route SHALL support pagination parameters (page number and page size) for technique lists
2. THE API_Route SHALL support pagination parameters for video search results
3. THE default page size SHALL be 20 items per page
4. THE API_Route SHALL return total count in the response metadata
5. THE response SHALL include pagination metadata (current page, total pages, has next, has previous)
6. WHEN page number exceeds available pages, THE API_Route SHALL return an empty array
7. THE API_Route SHALL validate that page size does not exceed 100 items
