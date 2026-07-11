// Central GSAP setup for the Human Bloom homepage (Phase 1).
//
// GSAP 3.13+ ships ScrollTrigger and SplitText in the free main package
// (Webflow made all plugins free in April 2025), so no paid dependency and
// no separate license import is required. Register the plugins once here and
// import { gsap, ScrollTrigger, SplitText } from "@/lib/gsap" everywhere else.
//
// Plugins register only in the browser — importing them during SSR is a no-op
// guard so this file is safe to import from client components.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

export { gsap, ScrollTrigger, SplitText };
