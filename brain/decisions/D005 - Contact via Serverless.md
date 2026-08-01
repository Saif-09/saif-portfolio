---
title: D005 - Contact via Serverless
type: decision
status: accepted
created: 2026-07-17
tags: [decision, contact, backend]
---

# D005: Contact via serverless + Resend

**Context:** Site must make contacting Saif effortless, and the contact surface should itself demonstrate craft.

**Options considered:**
- Direct links only (mailto/LinkedIn/Calendly), zero backend, but no craft showcase.
- **Form + serverless function + Resend**, a real form with full states.
- Form + Calendly embed too.

**Decision:** **Form on one Vercel serverless function + Resend** (chosen by Saif), direct links alongside. See [[Contact Form]].

**Why:** A form that handles loading/success/error + validation + spam protection perfectly is a live, unfakeable sample of engineering standards, [[D001 - Site as Proof Principle]] in action. No DB needed.

**Trade-offs:** a tiny bit more surface to maintain than pure links; worth it. Consent posture still open ([[Open Questions]] #6).
