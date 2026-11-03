# Product Overview

## Summary

A responsive web platform for private Jiu-Jitsu instructors to manage their practice. Connects four key elements: students, monthly planning, scheduling, and technique libraries. Teachers plan monthly content, associate techniques and videos to scheduled lessons, and register class outcomes. Students view their schedule, assigned plan, technique library access, and class history.

## Problem Solved

Private instructors typically manage students, schedules, training plans, and videos through separate tools (calendar, messages, spreadsheets, video folders). This creates inconsistent records and makes it difficult to share relevant materials with each student.

The platform centralizes these activities in a clear sequence:
1. Teacher creates student account
2. Define recurring or individual lesson times
3. Build monthly lesson plan
4. Organize techniques and videos in library
5. Associate content to planned days or specific lessons
6. Record actual lesson outcomes
7. Students view their agenda, history, and permitted videos

## Value Proposition

- **For teachers:** Less administrative overhead, better organization of student tracking
- **For students:** Clear visibility of upcoming lessons, easy access to videos, documented training record
- **For business:** Foundation for future subscriptions, limits per teacher, multiple instructors, academy adoption

## Product Principles

1. Simple to use during daily teaching routine
2. Responsive interface usable on mobile
3. Clear separation between planning (intent) and actual history (reality)
4. Reusable technical content without file duplication
5. Data isolated by teacher with explicit student permissions
6. History preserved when plans or schedules change
7. Simple initial architecture, prepared for growth

## MVP Scope

**Include:** User accounts, student management, technique library, monthly planning, recurring schedules, lesson booking, lesson history, video association, student portal access

**Exclude (post-MVP):** Native apps, payments/billing, live classes, AI planning, chat, marketplace, gamification, multiple instructors, external calendar sync, assessments/quizzes

## Key Data Model Concepts

- **Profiles:** User accounts (teacher or student)
- **Teachers:** Teacher-specific configuration
- **Enrollments:** Teacher-Student relationship (central to data isolation)
- **Monthly Plans:** Pedagogical planning for a period
- **Plan Days:** Individual day within a plan
- **Techniques/Modules/Videos:** Reusable library content
- **Lessons:** Concrete class occurrence with status (scheduled, completed, cancelled, no_show)
- **Weekly Slots:** Recurring schedule definitions
- **Access Control:** Student permissions to techniques/videos

## Core Business Rules

- All records must be scoped to the responsible teacher
- Teacher only manages their own data
- Student only views their permitted data
- Plans are planning intent; lessons are reality
- Only completed lessons count as executed
- Plan changes don't retroactively modify lesson history
- Videos are reusable across multiple lessons and plans
- Archived records preserve history
- Internal notes never appear in student area
- Authorization enforced server-side, not UI-only
