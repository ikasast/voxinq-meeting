"use client";

import { useEffect } from "react";

// The app's tooltips: above what they describe, not under the pointer (v4).
//
// Every explanation on hover was a `title`, which the browser draws itself — below and to the
// right of the pointer, where the arrow covers its first words, in a style no page can change.
// This replaces all of them at once rather than one by one. Pointed at with a mouse, an element
// with a `title` gives it up to `data-tip`, so the browser's own never appears, and the text is
// shown in a bubble over the element, centred on it, or under it when there is no room above.
//
// Nothing else changes: components still say `title=`. What the title gave assistive technology
// is kept — as the name of an element with nothing else to call it, otherwise as its description.
// Touch shows nothing, as `title` never did; keyboard focus shows it as hovering does.

/** How long a pointer rests before the first tip; once one has shown, the next is immediate. */
const DELAY_MS = 450;
const WARM_MS = 600;
/** Space between the element and the tip, and between the tip and the window's edge. */
const GAP = 6;
const EDGE = 8;

type Box = { top: number; left: number; width: number; height: number };

/** Where a tip of `size` goes for an element at `rect`, in a window `view` wide and high. */
export function placeTip(
  rect: Box,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { top: number; left: number; above: boolean } {
  const above = rect.top - GAP - size.height >= EDGE;
  const top = above ? rect.top - GAP - size.height : Math.min(rect.top + rect.height + GAP, view.height - EDGE - size.height);
  const centred = rect.left + rect.width / 2 - size.width / 2;
  const left = Math.max(EDGE, Math.min(centred, view.width - EDGE - size.width));
  return { top: Math.max(EDGE, top), left, above };
}

/**
 * Take an element's `title` for the tip, keeping what it told a screen reader: the element's
 * name when it has no other (an icon button), otherwise its description.
 */
function adopt(el: Element): string {
  const title = el.getAttribute("title");
  if (title !== null) {
    el.removeAttribute("title");
    el.setAttribute("data-tip", title);
    const named = el.hasAttribute("aria-labelledby") || (el.hasAttribute("aria-label") && !el.hasAttribute("data-tip-named"));
    if (!named && (el.hasAttribute("data-tip-named") || !el.textContent?.trim())) {
      el.setAttribute("aria-label", title);
      el.setAttribute("data-tip-named", "");
    } else if (el.getAttribute("aria-label") !== title) {
      el.setAttribute("aria-description", title);
    }
  }
  return el.getAttribute("data-tip") ?? "";
}

export function Tooltips() {
  useEffect(() => {
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);

    let current: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastHidden = 0;

    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if ("show" in tip.dataset) lastHidden = Date.now();
      delete tip.dataset.show;
      current = null;
    };

    const show = (el: Element) => {
      const text = adopt(el);
      if (!text || !el.isConnected) return hide();
      tip.textContent = text;
      tip.style.left = "0px";
      tip.style.top = "0px";
      tip.dataset.show = "";
      const r = el.getBoundingClientRect();
      const at = placeTip(r, { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
      tip.style.left = `${at.left}px`;
      tip.style.top = `${at.top}px`;
    };

    const point = (el: Element, now: boolean) => {
      if (el === current) return;
      hide();
      current = el;
      adopt(el); // at once, so the browser's own never starts its timer
      if (now || Date.now() - lastHidden < WARM_MS) show(el);
      else timer = setTimeout(() => current === el && show(el), DELAY_MS);
    };

    const target = (n: EventTarget | null) =>
      n instanceof Element ? n.closest("[title]:not(svg *, iframe), [data-tip]") : null;

    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = target(e.target);
      if (el) point(el, false);
      else if (current) hide();
    };
    const out = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      if (target(to) !== current) hide();
    };
    const focus = (e: FocusEvent) => {
      const el = target(e.target);
      if (el && el === e.target && el.matches(":focus-visible")) point(el, true);
    };
    const moved = () => {
      if (current && !current.isConnected) hide();
    };

    // A title set again while its tip is showing — React re-rendering it — is taken again, so
    // the browser's own does not appear over ours.
    const titles = new MutationObserver((records) => {
      for (const r of records) {
        if (r.target === current && (r.target as Element).hasAttribute("title")) show(current);
      }
    });
    titles.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["title"] });

    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointermove", moved, { passive: true });
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      titles.disconnect();
      tip.remove();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointermove", moved);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return null;
}
