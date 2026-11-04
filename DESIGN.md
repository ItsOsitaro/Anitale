---
name: Anitale
description: A Persian, right-to-left anime and manga catalog that feels like soft sakura paper with deep ink text.
colors:
  sakura-rose: "oklch(0.58 0.19 12)"
  sakura-rose-night: "oklch(0.735 0.165 10)"
  petal-wash: "oklch(0.925 0.026 340)"
  petal-blush: "oklch(0.906 0.05 348)"
  ink-plum: "oklch(0.26 0.035 335)"
  ink-plum-secondary: "oklch(0.42 0.13 8)"
  paper-mist: "oklch(0.976 0.007 330)"
  paper-card: "oklch(1 0 0)"
  paper-muted: "oklch(0.945 0.013 335)"
  ink-muted: "oklch(0.53 0.032 340)"
  petal-border: "oklch(0.904 0.032 345)"
  alert-red: "oklch(0.577 0.245 27)"
  night-ground: "oklch(0.185 0.022 335)"
  night-card: "oklch(0.235 0.026 335)"
  night-ink: "oklch(0.93 0.016 340)"
typography:
  body:
    fontFamily: "'Vazirmatn Variable', Tahoma, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  headline:
    fontFamily: "'Vazirmatn Variable', Tahoma, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "'Vazirmatn Variable', Tahoma, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "'Vazirmatn Variable', Tahoma, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  control: "14px"
  panel: "20px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "22px"
  page-gutter: "20px"
components:
  button-primary:
    backgroundColor: "{colors.sakura-rose}"
    textColor: "{colors.paper-card}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 14px"
  button-outline:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink-plum}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 14px"
  panel:
    backgroundColor: "{colors.paper-card}"
    rounded: "{rounded.panel}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.petal-wash}"
    textColor: "{colors.ink-plum-secondary}"
    rounded: "{rounded.pill}"
---

# Design System: Anitale

## Overview

**Creative North Star: "Sakura & Ink"**

The code names its own language "Sakura & Ink" and the system honors it: soft cherry-blossom pinks on a warm paper ground, with text set in a deep plum ink rather than black. Surfaces are rounded, quiet and slightly translucent; the site should feel like a calm reading room for anime and manga, not a database console. Persian text and right-to-left flow are the native condition, so every layout is built with logical properties and Vazirmatn first.

Density is moderate on desktop (a three-column shell: left navigation, main content, right panel) and single-column and thumb-friendly on mobile. Depth is gentle: faint tinted shadows, glass-like translucent bars, and soft radial blooms in the page background. A dark theme keeps the same plum hue family instead of switching to neutral grey or neon.

**Key Characteristics:**
- Warm paper background with three faint radial color blooms (rose, petal, mist-teal).
- One accent: Sakura Rose; pink-tinted neutrals everywhere else.
- Rounded forms (14px controls, 20px panels, pill chips and fields).
- Translucent, blurred top bar; panels slightly see-through.
- Vazirmatn Variable for all text; Persian digits via formatting helpers.

## Colors

A restrained, pink-tinted palette: one rose accent over plum-tinted neutrals, mirrored in a dark theme of the same hue. All colors are OKLCH design tokens defined in `src/tailwind.css`; use the tokens (`--primary`, `--card`, `--border`, ...), never raw values.

### Primary
- **Sakura Rose** (`oklch(0.58 0.19 12)`): primary actions, links on hover, active states, focus ring, selection tint. In dark theme it lifts to **Sakura Rose Night** (`oklch(0.735 0.165 10)`).

### Secondary
- **Petal Wash** (`oklch(0.925 0.026 340)`): secondary surfaces, chips, soft fills; text on it is **Ink Plum Secondary** (`oklch(0.42 0.13 8)`).
- **Petal Blush** (`oklch(0.906 0.05 348)`): accent fills and hover highlights.

### Neutral
- **Paper Mist** (`oklch(0.976 0.007 330)`): page ground.
- **Paper Card** (`oklch(1 0 0)`): cards, popovers, controls.
- **Paper Muted** (`oklch(0.945 0.013 335)`) and **Ink Muted** (`oklch(0.53 0.032 340)`): quiet fills and secondary text.
- **Ink Plum** (`oklch(0.26 0.035 335)`): body text and headings.
- **Petal Border** (`oklch(0.904 0.032 345)`): borders and dividers.
- **Night Ground / Card / Ink** (`oklch(0.185 0.022 335)` / `oklch(0.235 0.026 335)` / `oklch(0.93 0.016 340)`): the dark theme's ground, surface and text.

### Semantic
- **Alert Red** (`oklch(0.577 0.245 27)`): destructive actions and errors only.

### Named Rules
**The One Voice Rule.** Sakura Rose is the only saturated color; it marks what is actionable or current and stays rare on any screen.

**The Tinted Neutral Rule.** Neutrals carry a trace of plum (hue 330–348). Pure grey and pure black do not appear in light theme; dark theme stays plum, never neutral grey.

## Typography

**Display / Body / Label Font:** Vazirmatn Variable (with Tahoma, Arial, sans-serif)

**Character:** One humanist Persian sans for everything, with hierarchy made by weight and size rather than by font pairing. Latin text and digits sit comfortably beside Persian script.

### Hierarchy
- **Headline** (700, 24px, 1.3): page titles and 404/empty-state headings.
- **Title** (700, 18px, 1.4): section headings in panels and rails.
- **Body** (400, 14px, 1.65): default reading text; synopses may run to long measures, so cap at roughly 70ch where text is long.
- **Label** (700, 13px, 1.4): chips, links styled as actions, form labels.

### Named Rules
**The One Family Rule.** Do not introduce a second typeface; vary weight and size instead.

**The Persian Digit Rule.** Numbers shown to users go through `formatNumber(value, lang)` so digits follow the active language.

## Layout

Desktop uses a centered shell (`width: min(1280px, calc(100% - 40px))`) with a three-column grid: 232px left sidebar, flexible main column, 302px right column, 22px gap. Below the 820px breakpoint the site switches to a separate mobile shell (single column, bottom navigation, sheets for filters and entry editing). Other breakpoints exist at 520, 600, 700, 900 and 1100px for individual components.

Spacing rhythm is built on 8px steps (8, 16, 22 as the common gaps). Use logical properties (`margin-inline-start`, `inset-inline-end`, `padding-inline`) everywhere; the site is `dir="rtl"` by default.

## Elevation & Depth

Hybrid, mostly flat: surfaces separate by a thin tinted border, a very faint shadow, and translucency rather than by strong lift. Depth comes from the soft radial blooms behind the page, a blurred translucent top bar, and slightly see-through panels.

### Shadow Vocabulary
- **Control** (`0 1px 2px 0 oklch(0.26 0.035 335 / 0.09)`): buttons and fields at rest.
- **Press** (`inset 0 1px 3px 0 oklch(0.26 0.035 335 / 0.16)`): pressed controls.
- **Panel** (`0 1px 2px oklch(0.26 0.035 335 / 0.04), 0 18px 44px -18px oklch(0.45 0.09 340 / 0.12)`): panels, a wide diffuse plum-tinted glow.
- **Top bar** (`inset 0 -1px 0` border tint plus `0 10px 34px oklch(0.35 0.06 340 / 0.06)`): the sticky glass header with `backdrop-filter: blur(18px) saturate(1.5)`.

### Named Rules
**The Quiet Lift Rule.** Shadows are tinted with plum and stay faint; nothing casts a hard or grey shadow.

## Shapes

Rounded and friendly. Controls use 14px (`--radius-control`), panels about 20px (radius + 8px), cards and sheets 12–16px, and chips, search fields and status pills are full pills (999px). Cover images are rounded rectangles; avatars and the theme switch are circular. Borders are 1px in Petal Border, often mixed with transparency.

## Components

### Buttons
- **Shape:** soft rounded rectangle (14px), 38px tall on desktop, 44px minimum touch height on mobile where it is the main action.
- **Primary:** Sakura Rose fill with near-white text; hover dims the fill to 80%; pressed scales to 95% and swaps to the inset press shadow.
- **Outline / Secondary / Ghost:** white (`--control`) fill, Petal Border outline, Control shadow; hover shifts to Paper Muted.
- **Focus:** a 2px Sakura Rose ring with 2px offset (`:focus-visible`).

### Chips
- **Style:** pill (999px), Petal Wash fill, Ink Plum Secondary text, 13px bold.
- **State:** the selected chip switches to the Sakura Rose treatment (`is-active`, `aria-pressed`); used for genre filters, quick links and sort choices.

### Cards / Containers
- **Corner Style:** 20px panels; poster cards use the cover's own rounded rectangle.
- **Background:** Paper Card at about 88% opacity over the blooms.
- **Shadow Strategy:** Panel shadow only; no heavy elevation on hover.
- **Border:** 1px Petal Border at about 58% opacity.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** pill-shaped (999px), white translucent fill, Petal Border outline, Control shadow.
- **Focus:** the global 2px Sakura Rose ring.
- **Error / Disabled:** Alert Red for errors; disabled controls drop to 50% opacity.

### Navigation
- **Style:** a sticky translucent top bar with the logo, section links, search combobox, language and theme switches; on mobile a bottom navigation and filter/entry sheets with a swipe handle.
- **States:** hover and current items take Sakura Rose emphasis; touch targets are at least 24px.

### Hero carousel (signature, mobile)
Large cover cards with score, category and year chips and a clamped synopsis, scrolling horizontally with small dot indicators (8px dots, 24px hit area). Only the first card is the page `h1`.

## Do's and Don'ts

### Do:
- **Do** use tokens (`--primary`, `--card`, `--border`, `--muted-foreground`, ...) and the dark theme counterparts instead of raw colors.
- **Do** build with RTL logical properties and keep Persian as the primary voice.
- **Do** keep touch targets at least 24px (44px for main mobile actions) and labels that match visible text, so Lighthouse accessibility stays at 100.
- **Do** keep motion light and short; respect reduced motion.
- **Do** keep sensitive-content covers behind the user's toggle.

### Don't:
- **Don't** imitate the dense, dated look of old MyAnimeList: crowded tables and saturated blue.
- **Don't** add neon or high-saturation glow to the dark theme; it stays plum and calm.
- **Don't** add heavy or decorative animation, especially on mobile and slow networks.
- **Don't** add a second typeface or hard-coded colors.
- **Don't** use grey or black shadows; shadows are plum-tinted and faint.
