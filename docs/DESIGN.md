---
name: The Digital Conservator
colors:
  # Surfaces — Material 3-style tonal hierarchy
  surface: '#F7FAFC'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#F1F5F9'
  surface-container: '#EBEEF0'
  surface-container-high: '#E2E8F0'
  surface-container-highest: '#CBD5E1'
  # Text on surfaces
  on-surface: '#181C1E'
  on-surface-variant: '#44474C'
  inverse-surface: '#2D3133'
  inverse-on-surface: '#EEF1F3'
  outline: '#74777D'
  outline-variant: rgba(4, 22, 39, 0.20)
  # Primary — deep navy, anchors the Signature Gradient
  primary: '#041627'
  on-primary: '#FFFFFF'
  primary-container: '#1A2B3C'
  on-primary-container: '#74859B'
  # Secondary — subdued blue-grey
  secondary: '#4F6073'
  on-secondary: '#FFFFFF'
  secondary-container: '#D2E4FB'
  on-secondary-container: '#556679'
  # Brand accent — Juniper Mist teal, used sparingly (charts, progress, focus rings)
  brand: '#0096A4'
  on-brand: '#FFFFFF'
  # Status
  healthy: '#10B981'
  drift: '#F97316'
  drift-container: '#FFEDD5'
  error: '#BA1A1A'
  on-error: '#FFFFFF'
  error-container: '#FFDAD6'
  on-error-container: '#93000A'
typography:
  display-lg:
    fontFamily: manrope
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  '1': 0.25rem
  '2': 0.5rem
  '3': 0.75rem
  '5': 1.25rem
  '6': 1.5rem
  '8': 2rem
  '10': 2.5rem
  '12': 3rem
  '24': 6rem
---

# Design System Strategy: Technical Assurance & Tonal Depth

## 1. Overview & Creative North Star

**Creative North Star: "The Digital Conservator"**

In the high-stakes world of network operations, a "standard" UI feels flimsy. This design system moves beyond the generic SaaS "box-and-line" aesthetic to embrace the role of a _Conservator_: an interface that is authoritative, calm, and meticulously structured.

The system rejects the "flatness" of modern web design in favor of **Tonal Layering**. We achieve professional polish not through decorative flourishes, but through the intentional use of asymmetric white space, sophisticated typography scales, and a "physical" approach to depth. It is designed to feel like a premium piece of hardware—solid, reliable, and deliberate—transitioning the user from the chaos of network drift to the serenity of a self-healed state.

---

## 2. Color & Surface Philosophy

The palette is rooted in the depth of `primary` (#041627) and the clarity of `surface` (#F7FAFC). We do not decorate; we communicate.

### The "No-Line" Rule

To achieve a high-end editorial feel, **1px solid borders are prohibited for sectioning.** Traditional grids are replaced by background color shifts.

- Use `surface-container-low` to define a workspace against a `surface` background.
- Use `surface-container-highest` for sidebars to create a structural anchor without needing a "line" to separate it from the content.

### Surface Hierarchy & Nesting

Treat the UI as a series of stacked, precision-cut materials.

- **Base:** `surface` (The foundation).
- **Level 1 (Sections):** `surface-container-low` (Subtle grouping).
- **Level 2 (Active Cards):** `surface-container-lowest` (White, floating elements that draw focus).
- **Level 3 (Overlays/Modals):** `surface-container-high` with 80% opacity and a 12px backdrop blur.

### The "Glass & Gradient" Rule

For critical CTAs or primary navigation active states, use a **Signature Gradient**: a linear transition from `primary` (#041627) to `primary-container` (#1A2B3C) at a 135-degree angle. This adds "soul" and a sense of weight to the interface.

### The Brand Accent

`brand` (`#0096A4`, Juniper Mist teal) is reserved for subtle brand echoes — chart fills, progress bars, focus rings, and other moments where the UI would otherwise sit in pure neutral territory. It is **not** a call-to-action color; primary and the Signature Gradient handle that. Use sparingly: one or two teal touches per screen is the target, not a brand flood.

---

## 3. Typography

We utilize a dual-typeface system to balance technical precision with editorial authority.

- **Display & Headlines (Manrope):** Chosen for its geometric stability. Use `display-lg` and `headline-md` with tight letter-spacing (-0.02em) to create a "command center" aesthetic.
- **Technical Data & UI (Inter):** The workhorse. Used for `body-md` and `label-sm`. Inter’s high x-height ensures that complex network configurations remain legible at small scales.

**Hierarchy as Identity:**
Always pair a `label-md` (All Caps, 0.05em tracking) above a `headline-sm` to provide context. This "Overline" pattern creates a technical, documented feel synonymous with high-trust engineering tools.

---

## 4. Elevation & Depth

Depth in this system is a function of light and stack, not shadows.

- **The Layering Principle:** Avoid "Drop Shadows" for standard cards. Instead, place a `surface-container-lowest` (pure white) card on a `surface-container` background. The 2% difference in luminosity creates a "Soft Lift" that feels integrated.
- **Ambient Shadows:** For floating elements (Modals, Tooltips), use an extra-diffused shadow: `0 20px 40px rgba(4, 22, 39, 0.06)`. This uses a tint of our `primary` color rather than grey, making the shadow feel like a natural light obstruction.
- **The Ghost Border:** For accessibility in data tables or inputs, use `outline-variant` at 20% opacity. It should be felt, not seen.
- **Glassmorphism:** Use `surface-container-high` at 70% opacity with a `blur(10px)` for global navigation headers to allow the "Self-Healing" status visualizations to bleed through as the user scrolls.

---

## 5. Components

### Cards & Technical Containers

- **Constraint:** Zero borders.
- **Styling:** Use `roundedness.lg` (0.5rem).
- **Layout:** Content must be separated by `spacing.6` (1.3rem) rather than dividers. This "Air-as-Divider" approach reduces visual noise in data-heavy environments.

### Status Badges (The "Healing" Indicators)

Status is the heartbeat of this system. Badges must be high-contrast and utilize "Glow" states:

- **Healthy:** `healthy` (emerald) background with a subtle inner-glow.
- **Drift:** `drift` (orange) text on a `drift-container` background.
- **Critical:** `error` (#BA1A1A) text on `error_container`.

### Buttons

- **Primary:** Signature Gradient (`primary` to `primary_container`), `roundedness.md`, white text. No shadow.
- **Secondary:** `surface-container-highest` background, `on-surface` text.
- **Tertiary:** Ghost style. No background; `primary` text. Use for low-emphasis actions like "Cancel" or "View Logs."

### Technical Data Tables

- **Header:** `surface-container-high` background, `label-md` (Bold) text.
- **Rows:** No horizontal lines. Use a subtle `surface-container-low` background on hover.
- **Spacing:** Use `spacing.3` for vertical cell padding to maximize data density without feeling cramped.

### The Self-Healing Timeline (Custom Component)

A vertical or horizontal thread using `brand` (teal) to show the "Health" over time. Use overlapping circles and `surface-container-high` connectors to illustrate the platform's modularity.

---

## 6. Do’s and Don’ts

### Do

- **Do** use asymmetric layouts. For example, a wide technical table on the left (7 cols) paired with a narrow "Drift Analysis" card on the right (5 cols).
- **Do** use `spacing.10` and `spacing.12` to create generous breathing room between major sections.
- **Do** use "Tonal Nesting" (Darker surface inside a lighter surface) to indicate a hierarchy of information.

### Don't

- **Don't** use 100% black (#000) for text. Always use `on-surface` (#181C1E) for better optical comfort.
- **Don't** use standard "drop shadows" or 1px borders to separate content blocks.
- **Don't** use icons without labels in technical areas. In a self-healing framework, clarity beats minimalism.
- **Don't** crowd the sidebar. Use `spacing.5` between navigation items to maintain a "calm" technical vibe.

---

## 7. Spacing & Rhythm

This system operates on a **Non-Linear Scale**.

- Small increments (`0.5` to `3`) are for internal component padding.
- Large increments (`8` to `24`) are for "Page Rhythm."
  The goal is to create a "Pulse"—tight, data-dense modules surrounded by wide, airy expanses of neutral space. This contrast directs the eye to what matters: the health of the network.