---
title: Contact Form
type: feature
status: planned
created: 2026-07-17
tags: [feature, contact]
related: ["[[D005 - Contact via Serverless]]"]
---

# Contact Form

Makes hiring Saif effortless, and doubles as a live craft demo. A form that nails every state is an unfakeable sample of engineering standards ([[North Star - Site as Proof]]).

- Fields: name, email, message, with **real-time validation** and full **loading / success / error** states.
- Backend: one Vercel serverless function + Resend → routes to saifmd238@gmail.com. Rationale: [[D005 - Contact via Serverless]].
- Spam: honeypot + rate-limit. A11y: labels + `aria-live` feedback.
- Direct links alongside: email, LinkedIn, GitHub `Saif-09`, resume.

Open: consent posture ([[Open Questions]]).
