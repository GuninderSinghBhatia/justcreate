# Phase 4 exit gate — design.md → coding agent

**Date:** 2026-10-23 · **Gate:** for 3 boards with different styles, a coding agent builds a page from design.md alone; at least 2 of 3 should be recognisably in the board's style.

## Method

1. Three boards of real site screenshots (1280×800, captured with Playwright):
   - **dark-product:** linear.app, vercel.com, raycast.com
   - **warm-editorial:** anthropic.com, press.stripe.com, are.na
   - **bright-playful:** gumroad.com, figma.com, duolingo.com
2. The real worker analysed each reference and generated design.md (Gemini free tier: `gemini-3.5-flash`, one board on `gemini-3.5-flash-lite`).
3. Claude Code, playing the coding agent, built the same landing page content (a fictional notes app, “Margins”) once per board, **reading only design.md**, not the screenshots.
4. Each build was screenshotted next to its board's references.

## Result: 3 of 3 recognisably in style (gate: 2 of 3)

| Board | Verdict | What carried over from the spec |
|---|---|---|
| warm-editorial | In style | `#FAF9F5` canvas, `#201819` charcoal, pill nav, flat `#EFEFEE` panels, Newsreader italic tagline, glyph wordmark (`MARGINS\`), dark quote band |
| bright-playful | In style | Floating pink coins with drop shadow, black-framed search field, black active nav pill, green 3D button with `#469b0a` bevel, Duolingo-style split section |
| dark-product | In style | `#07080a` canvas, floating blurred pill nav, tight bold Inter headline, light pill CTA, low-opacity logo row |

Caveat: the same model family wrote the builds and judged them. Repeat the gate yourself with your own boards and an independent eye.

## Findings

- **Mixed boards produce hedged specs.** dark-product included one light site (Vercel), and with only 3 references there were no clusters to split it out, so the spec said “near-black … or stark light”. With more references, accept a cluster and generate from that cluster only (the spec editor's cluster picker).
- **Model matters.** The flash-lite spec (dark-product) was noticeably vaguer — fewer exact values and fewer Observed/Inferred tags — than the two flash specs. Use the stronger model for specs once the API key has billing.
- **Fixed:** generated specs had stacked blank lines between sections (cosmetic); the section join now normalises spacing.

Artifacts (local, not committed): the specs, builds and side-by-side screenshots are in the session scratchpad under `pw/gate/`.
