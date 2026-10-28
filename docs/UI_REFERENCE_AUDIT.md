# OverlapWeave — UI Reference Audit & Refinement Plan

**Reference URL:** `https://parley.framer.ai/`  
**Target Local URL:** `http://127.0.0.1:5173/`  
**Audit Viewport:** 1536 × 900 (deviceScaleFactor: 2)  
**Date:** 2026-10-28  

---

## 1. Executive Summary

A programmatic DOM and visual motion audit of the live reference site `https://parley.framer.ai/` was performed using Puppeteer and Google Chrome. The audit captured concrete geometry, computed styles, interactive states, and transitions across all major sections.

The current local implementation (`local-before/`) captured the general editorial mood, but contains distinct discrepancies in **feature card expansion mechanics, inactive card surface colors, hero copy/dimensions, capability mockup styling, research claim verifiability, and integration icon presentation**.

---

## 2. Section-by-Section Discrepancy Matrix

### Section A: Feature Cards ("Why OverlapWeave")

| Property | Parley Framer Reference | Current Local OverlapWeave (`local-before`) | Discrepancy & Required Change |
| :--- | :--- | :--- | :--- |
| **Card Layout & Sizing** | Container width 1240px, flex row with `gap: 12px`. Inactive card width **284px** (`flex: 1 0 0px`), height **420px**. Active card expands to **352px** (`flex: 1.24`), height **440px**. | 4 equal-width static CSS grid columns (`repeat(4, 1fr)`). Height fixed at 360px. | **High:** Replace static grid with expanding flex row. Inactive flex `1`, active flex `1.24`. Height `420px` transitioning to `440px`. |
| **Inactive Surface** | Warm muted beige `rgb(238, 237, 230)` (`#EEEDE6` / `#EEECE4`). No prominent border. Large pale watermark number `01.`, `02.`, `03.`, `04.` at top-left. Geometric pattern at top-right. Title near bottom. | Plain white surface `#ffffff` with a light gray border around every card. Title at middle. | **High:** Set inactive card background to `#EEECE4`, remove harsh borders. Position pale watermark numbers and warm orange geometric motifs in upper section. |
| **Active Card Surface** | Pure white `rgb(255, 255, 255)`, `border-radius: 20px`, elevated box-shadow `0px 12px 16px 0px rgba(235, 232, 228, 0.8)`. Upper half dedicated to preview illustration. | Only Card 01 had a hardcoded preview box, but was not expandable upon hovering cards 02, 03, or 04. | **High:** Active card dynamically expands on hover or click. Dedicated upper preview illustration for each card (Mixture ASR, Overlap Clash, Routing Utility, Reconciled Dialogue). |
| **Card Titles & Copy** | Specific to application pipeline with concise, readable typography. | Generic copy ("Takes real action", "Connects everything", "Gets better over time"). | **Medium:** Rewrite titles to speech pipeline themes: <br>1. *Mixture-first ASR*<br>2. *Overlap detection*<br>3. *Benefit-aware routing*<br>4. *Measured evaluation*. |
| **Interaction & Motion** | Hover or click triggers smooth flex width and background transition (`380ms cubic-bezier(0.16, 1, 0.3, 1)`). | Static CSS hover with simple translateY. | **High:** Connect active index to React component state (`activeFeatureCard`). Smooth CSS flex expansion. |

### Section B: Hero Section

| Property | Parley Framer Reference | Current Local OverlapWeave (`local-before`) | Discrepancy & Required Change |
| :--- | :--- | :--- | :--- |
| **Hero Dimensions** | Vertical height 620–650px. Max content width ~1240–1280px. Generous internal padding (80px top/bottom). | Height 540px, slightly compressed vertically. | **Medium:** Adjust min-height to 620px, increase internal vertical breathing room. |
| **Headlines & Copy** | Clear editorial proposition with italic supporting serif. | Contained unverified promises: "pristine speaker-attributed ASR", "Get started free". | **High:** Refine headline to: <br>Eyebrow: `MULTI-TALKER SPEECH RESEARCH`<br>Headline: `Hear more of the conversation.`<br>Italic line: `Even when voices collide.`<br>Body: Grounded description of selective routing. <br>CTAs: `Launch Studio` & `Explore Benchmarks`. |
| **Partner / Technology Strip** | Pale monochrome logos with even spacing. | Text labels in plain gray. | **Low:** Enhance SVG rendering and spacing for PyTorch, Whisper, Torchaudio, FastAPI, Hugging Face. |

### Section C: Capability Showcase ("Intelligent Delegation")

| Property | Parley Framer Reference | Current Local OverlapWeave (`local-before`) | Discrepancy & Required Change |
| :--- | :--- | :--- | :--- |
| **Left Selector List** | 4 vertically spaced items. Active item has orange double-chevron `>>`, semibold title, and concise active explanation. Inactive items quiet. | Had active item text, but copy was overly dense. | **Medium:** Align 4 items to: 1. *Original-mixture transcription*, 2. *Overlap-region detection*, 3. *Selective speech separation*, 4. *Speaker-attributed reconciliation*. |
| **Right Application Mockup** | Clean miniature workstation window with macOS traffic lights, sidebar, and realistic application preview. | Generic task execution stepper. | **High:** Update mockup to showcase genuine OverlapWeave components: waveform canvas slice, acoustic clash detection interval, utility equation gauge ($U = +0.38$), and separated speaker dialogue. |

### Section D: Integrations Section

| Property | Parley Framer Reference | Current Local OverlapWeave (`local-before`) | Discrepancy & Required Change |
| :--- | :--- | :--- | :--- |
| **Icon Presentation** | Pale square tiles with clean, restrained authentic logos. | Used colorful emoji marks (🔥, 🎙️, ⚡, 🤗, 🐳, 🐍). | **High:** Replace all emoji badges with crisp, monochrome or authentic SVG marks for PyTorch, Whisper, Torchaudio, FastAPI, Hugging Face, Docker, Python, Web Audio, Librosa/SciPy, React, WebRTC, GitHub. |

### Section E: Empirical Results & Performance Claims

| Property | Parley Framer Reference | Current Local OverlapWeave (`local-before`) | Discrepancy & Required Change |
| :--- | :--- | :--- | :--- |
| **Grounding of Metrics** | Genuine pricing / plan cards. | Highlighted `27.6% SA-WER`, `5.8× speedup`, `35% separation`, `0.0% degradation` without linking to actual benchmark file provenance. | **High:** Audit against `results/benchmarks.json`. Clearly distinguish evaluated synthetic test set metrics from general production claims. Rephrase routing explanation to distinguish predicted benefit from ground truth. Main CTA opens the Benchmark Lab. |

---

## 3. Implementation Plan

1. **Phase 1: Feature Cards Overhaul (`landing.css` & `LandingPage.tsx`)**
   - Introduce flex-based expanding card container (`.parley-cards-flex`).
   - Implement inactive card styling (`background: #EEECE4`, watermark `01.`-`04.`, orange geometric square grids, lower title position).
   - Implement active card styling (`background: #FFFFFF`, `border-radius: 20px`, `box-shadow`, flex ratio `1.24`).
   - Create 4 dedicated interactive preview illustration components for the 4 active card states:
     - Card 01 Preview: Mixture-first ASR confidence & waveform probe.
     - Card 02 Preview: Harmonic clash detection ($C_{harm}$) audio collision interval.
     - Card 03 Preview: Benefit-aware utility gauge ($U = \mathbb{E}[\Delta\text{Acc}] - \lambda \cdot \text{Cost}$).
     - Card 04 Preview: Speaker 1 / Speaker 2 attributed transcript timeline.
   - Attach pointer enter/hover and click handlers with stable React state.

2. **Phase 2: Hero & Typography Refinement**
   - Adjust hero min-height to 630px and internal padding to 90px 36px.
   - Apply the verified copy:
     - Eyebrow: `MULTI-TALKER SPEECH RESEARCH`
     - Headline: `Hear more of the conversation.`
     - Supporting serif: `Even when voices collide.`
     - Body: Clear, grounded explanation of benefit-aware adaptive routing.
     - CTAs: `Launch Studio` (primary) and `Explore Benchmarks` (secondary).

3. **Phase 3: Capability Showcase & Application Mockup**
   - Align the 4 list items to the pipeline stages.
   - Refine the right-side macOS application window to display genuine OverlapWeave visual cues (waveform timeline, clash interval, utility computation, demixed stems).

4. **Phase 4: Integrations Grid Authentic SVGs**
   - Eliminate emoji icons; render clean, authentic SVG vector marks inside pale rounded tiles with subtle borders.

5. **Phase 5: Verification & Capture**
   - Capture `local-after/` screenshots at 1536 × 900 across all interaction states.
   - Verify layout stability, smooth transitions, and absence of horizontal overflow.
   - Run tests and frontend production build.

