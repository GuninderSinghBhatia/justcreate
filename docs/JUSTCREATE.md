# JUSTCREATE — AI-Powered Design Inspiration and Curation Platform

## Overview

JUSTCREATE is an AI-powered visual inspiration platform that allows users to collect, organize, analyze, and transform design inspiration from anywhere on the internet into actionable design specifications.

The goal is to bridge the gap between finding something visually inspiring and actually building something inspired by it. Instead of saving random images, videos, screenshots, and websites across different platforms, users can bring everything into one centralized workspace where AI organizes their references and helps turn their creative vision into something they can implement.

---

## 1. Browser Extension for Capturing Inspiration

JUSTCREATE will provide a browser extension that allows users to save inspiration from virtually any website with minimal effort.

Users should be able to:

- Right-click any image and save it directly to their JUSTCREATE dashboard.
- Capture screenshots of entire pages, visible areas, or selected regions with a single click.
- Save YouTube videos as references, preserving their titles, thumbnails, URLs, and optional timestamps.
- Save inspiring X (Twitter) posts and other social media content.
- Save entire websites or specific web pages as design references.
- Quickly save content through a toolbar button or keyboard shortcut.

Every saved reference should retain its original source URL and relevant metadata whenever available. The capture experience should be fast, intuitive, and require as few clicks as possible.

---

## 2. A Visual Dashboard and Infinite Canvas

All captured references should appear in a centralized workspace where users can visually explore and manage their inspiration.

The dashboard should support different types of content, including images, screenshots, videos, social media posts, and website references.

Users should be able to:

- Drag and drop references around a canvas.
- Resize, rearrange, and group reference cards.
- Create multiple boards for different projects or creative interests.
- Add notes, labels, and descriptions to individual references.
- Search and filter their saved content.
- Manually organize references while allowing AI to suggest better groupings.

The interface should feel like a combination of a visual moodboard, a personal design library, and a flexible workspace for creative exploration.

---

## 3. AI-Powered Automatic Clustering

One of JUSTCREATE's core features is its ability to automatically analyze saved references and organize them into meaningful visual clusters.

The AI should analyze the visual characteristics, content, and context of each reference to identify similarities and relationships between them, regardless of their original format or source.

For example, if a user saves several futuristic websites, cyberpunk interfaces, neon color palettes, dark dashboards, and sci-fi animations, JUSTCREATE should recognize relevant similarities and suggest clusters such as:

- Cyberpunk Design
- Futuristic Interfaces
- Dark UI Design
- Neon Color Palettes
- Motion and Animation
- Experimental Typography

A single reference should be able to belong to multiple clusters when appropriate.

Users should be able to accept, reject, rename, merge, or modify AI-generated clusters. AI should assist with organization without taking away the user's control over their workspace.

---

## 4. AI-Generated Design Specification

The most important feature of JUSTCREATE is its ability to transform a curated collection of references into a structured `design.md` file.

Once a user has collected enough inspiration for a project, they should be able to ask JUSTCREATE to analyze the board and generate a comprehensive Markdown document describing the visual direction and design principles represented by those references.

The generated design specification should include:

- **Overall design direction:** The visual style, mood, atmosphere, and creative identity.
- **Color palette:** Primary and secondary colors, backgrounds, accents, and contrast.
- **Typography:** Font styles, hierarchy, sizing, and text treatments.
- **Layout and composition:** Grids, spacing, alignment, positioning, and visual hierarchy.
- **UI components:** Navigation bars, cards, buttons, panels, and other recurring interface patterns.
- **Visual effects:** Gradients, shadows, textures, borders, glass effects, and other distinctive details.
- **Animations and interactions:** Motion styles, transitions, hover effects, and interaction patterns when observable.
- **Responsive design:** Recommendations for adapting the visual direction to different screen sizes.
- **Implementation guidance:** Practical recommendations for translating the design direction into a working website or application.
- **Reference mapping:** Links to the specific saved references that informed each design decision.

The AI should distinguish between details directly observable in the references and details it has inferred or estimated.

The resulting file should be specific and useful enough to guide the development of a real project rather than merely describing a generic aesthetic.

Users should be able to preview, edit, regenerate, and download the generated Markdown file.

---

## 5. Integration with AI Coding Agents

JUSTCREATE should help users move directly from visual inspiration to implementation.

The generated `design.md` should be compatible with AI coding tools and agents such as Claude Code, Cursor, and other tools that can consume project documentation.

Initially, users should be able to download the file and add it to their coding project's context manually.

In the future, JUSTCREATE could offer direct integrations or an agent-accessible interface that allows authorized coding agents to retrieve the relevant design specification and associated references.

This would allow a user to collect inspiration, generate a design specification, and then ask their coding agent to build a website or application based on the collected design principles.

The goal is not necessarily to copy an existing design exactly, but to help users communicate their intended aesthetic, layout, and interactions to AI coding tools with greater precision.

---

## 6. User Experience and Product Philosophy

JUSTCREATE should prioritize speed, simplicity, and creative freedom.

The user should be able to capture inspiration without interrupting their browsing experience, return to their workspace later, and immediately understand the ideas they have collected.

AI should work in the background to discover patterns, organize references, and generate useful insights without forcing users into a rigid workflow.

The product should combine:

- The convenience of a browser-based clipping tool.
- The flexibility of a visual moodboard and infinite canvas.
- The intelligence of AI-powered visual analysis and semantic clustering.
- The practicality of structured design documentation.
- The usefulness of an integration layer for AI-assisted development.

The interface should feel modern, clean, visually rich, and designed for people who care about digital aesthetics.

---

## 7. Target Audience

The initial target audience includes:

- Web developers and indie hackers.
- UI/UX designers.
- Creative developers and digital artists.
- People building websites, applications, portfolios, and digital products with AI coding agents.

These users frequently encounter inspiring designs online but struggle to organize their references and translate them into clear implementation requirements.

JUSTCREATE aims to solve that problem.

---

## 8. Core Product Vision

JUSTCREATE is more than a bookmarking tool or a traditional inspiration board.

It is a personal visual intelligence workspace that transforms scattered inspiration from across the internet into organized creative knowledge and actionable design specifications.

**Core workflow:**

```
Discover → Capture → Curate → Cluster → Generate Design Spec → Build
```

The ultimate vision is to help users turn the things they love visually into things they can actually create.
