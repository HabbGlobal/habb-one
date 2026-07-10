"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function RouteChangeWatcher({ onRouteChange }: { onRouteChange: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onRouteChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (el.tagName === "A") return el as HTMLAnchorElement;
    el = el.parentElement;
  }
  return null;
}

/**
 * Global top progress bar shown while navigating between pages.
 * App Router has no router "start/complete" events, so we infer
 * navigation start from same-origin link clicks and completion from
 * the pathname/search params actually changing.
 */
export function NavigationProgress() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const growTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (growTimerRef.current) clearInterval(growTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setProgress(100);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setVisible(true);
    setProgress(10);
    growTimerRef.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 10 : p));
    }, 200);
    safetyTimerRef.current = setTimeout(finish, 8000);
  }, [clearTimers, finish]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = findAnchor(e.target);
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const current = window.location.pathname + window.location.search;
      const next = url.pathname + url.search;
      if (current === next) return;

      start();
    }

    // Capture phase: must run before React's onClick on <Link> calls
    // preventDefault(), otherwise e.defaultPrevented is already true here.
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearTimers();
    };
  }, [clearTimers, start]);

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeWatcher onRouteChange={finish} />
      </Suspense>
      {visible && (
        <div
          role="progressbar"
          aria-hidden="true"
          className="fixed left-0 top-0 z-[100] h-1 bg-primary shadow-[0_0_8px] shadow-primary/60 transition-[width,opacity] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      )}
    </>
  );
}
