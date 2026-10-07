# PromptHall Monitor: Design Brief

Version 1.0 · 7 October 2026

## Brand idea

"Your website. Our watch." PromptHall is the calm, competent person who tells you something is wrong before your customers do, in words you understand, and knows exactly what to say to the developer. Premium, quiet, precise. Never alarmist, never jargon-first.

## Tone of voice

- Plain English first. Technical detail second, clearly labelled "For your developer".
- Short sentences. Say what happened, what it means, what to do.
- No em dashes. Use commas, colons, full stops.
- Business impact over status codes: "Customers cannot book right now" before "HTTP 502".
- Honest about limits: "about a minute", "within 5 to 7 minutes", not "instant".
- Lagos time everywhere a time is shown.

## Colour

| Role | Hex | Use |
|---|---|---|
| Accent purple | `#7C5CFF` | Buttons, links, the italic word in headlines, 4px top rule on email cards |
| Deep purple | `#5B3FE0` | Pill text on purple-soft |
| Purple soft | `#F1EDFF` | Panels, pills |
| Ink (web, dark) | `#0E0C16` | Web page background |
| Ink (email) | `#15121F` | Headings on white |
| Text | `#3F3B52` | Body on white |
| Muted | `#7A7690` | Labels, footers |
| Lavender background | `#F4F2FB` | Email background |
| Success | `#15803D` on `#ECFDF3` | Resolved, fast |
| Warning | `#B45309` on `#FFF7E6` | Needs attention, could be faster |
| Danger | `#B91C1C` on `#FEF2F2` | Issue detected, down |

Only one accent colour. Status colours appear only on pills, scores and panels.

## Typography

- Web: Inter (400/500/600) for everything; Instrument Serif italic for the single emphasised phrase in headlines ("goes down.", "the pilot."). Mono (system) for small uppercase labels and technical text.
- Email: Inter with system fallback; Gmail will show Helvetica/Arial and the layout must still hold.
- Headline sizes: web hero up to 104px, tight letter-spacing (-0.035em); email h1 24px.
- Labels: 11 to 12px, uppercase, 1.2px tracking, muted.

## Layout rules

Web
- Dark background, no gradients, no grid textures, no fake terminal chrome.
- Generous whitespace: 96px above the hero, 72px between sections, hairline dividers (10% white) instead of boxes.
- Underline-style inputs; one black pill button that turns purple on hover.
- Tag input for lists (important pages), not textareas.
- Progress screens tell the truth: steps advance with time but completion waits for the server.

Email
- 600px white card on lavender, 16px radius, 4px purple top rule, logo top-left (132 x 44), context label top-right.
- Order: status pill, headline, what it means, what to do, developer box, closing line, footer.
- Developer box: light grey, monospace table, dark code block for the reproduce command.
- Footer always has: site monitored, "free pilot", request a fix, stop monitoring.

## Logo

`assets/logo.png` (transparent, 900 x 300) used on white in emails; `assets/logo-light.png` reserved for dark surfaces. Never stretch; height 44px in email headers.

## Accessibility and clients

- Contrast at least 4.5:1 for body text on both dark web and white email surfaces.
- Email built with tables and inline styles; tested in Gmail (web, Android), Yahoo, Outlook.
- Mobile first: all pages single column under 900px; tag input and progress screen usable with a thumb.
