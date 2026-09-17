"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface ProgressBarState {
  progress: number;
  visible: boolean;
  opacity: number;
}

function NavigationProgressBarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<ProgressBarState>({
    progress: 0,
    visible: false,
    opacity: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const currentUrlRef = useRef("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearAllTimers = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
  };

  const startNavigation = () => {
    clearAllTimers();
    startTimeRef.current = Date.now();

    // 1. Initial jump: 0% -> ~28%
    setState({
      progress: 28,
      visible: true,
      opacity: 1,
    });

    // 2. Realistic trickle progress:
    // ~28% -> ~65% at moderate rate, then ~65% -> ~88% at slower rate.
    // Never reaches 100% until route change finishes!
    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.visible) return prev;
        if (prev.progress < 65) {
          return { ...prev, progress: Math.min(65, prev.progress + (Math.random() * 8 + 4)) };
        } else if (prev.progress < 88) {
          return { ...prev, progress: Math.min(88, prev.progress + (Math.random() * 3 + 1)) };
        }
        return prev;
      });
    }, 180);

    // Safety timeout: if navigation stalls or fails (e.g. aborted), clean up after 8s
    safetyTimeoutRef.current = setTimeout(() => {
      finishNavigation();
    }, 8000);
  };

  const finishNavigation = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);

    const elapsed = Date.now() - startTimeRef.current;
    const minDisplayDuration = 120; // Prevent single-frame glitch on instant pre-cached routes
    const delayBeforeFinish = Math.max(0, minDisplayDuration - elapsed);

    finishTimeoutRef.current = setTimeout(() => {
      // Complete to 100%
      setState((prev) => (prev.visible ? { ...prev, progress: 100, opacity: 1 } : prev));

      // After 150ms at 100%, begin fade out
      resetTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, opacity: 0 }));

        // After fade out completes (250ms), reset state
        setTimeout(() => {
          setState({ progress: 0, visible: false, opacity: 0 });
        }, 250);
      }, 150);
    }, delayBeforeFinish);
  };

  // Intercept clicks on internal links
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Only handle standard left-clicks without modifier keys
      if (e.button !== 0 || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }

      if (!target) return;
      const anchor = target as HTMLAnchorElement;

      if (!anchor.href || anchor.hasAttribute("download") || anchor.target === "_blank") {
        return;
      }

      try {
        const url = new URL(anchor.href, window.location.href);

        // Ignore external navigation
        if (url.origin !== window.location.origin) return;

        // Ignore API routes, health checks, or downloads
        if (url.pathname.startsWith("/api/") || url.pathname === "/healthz" || url.pathname === "/readyz") {
          return;
        }

        // Ignore in-page hash links (e.g. href="#top") or exact current URL
        const currentPathWithSearch = window.location.pathname + window.location.search;
        const targetPathWithSearch = url.pathname + url.search;

        if (targetPathWithSearch === currentPathWithSearch) {
          return;
        }

        // Internal route navigation detected!
        startNavigation();
      } catch {
        // Ignore URL parsing errors
      }
    };

    // Listen for browser history back/forward
    const handlePopState = () => {
      startNavigation();
    };

    // Custom events for programmatic navigation
    const handleCustomStart = () => startNavigation();
    const handleCustomFinish = () => finishNavigation();

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("app:navigation-start", handleCustomStart);
    window.addEventListener("app:navigation-finish", handleCustomFinish);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("app:navigation-start", handleCustomStart);
      window.removeEventListener("app:navigation-finish", handleCustomFinish);
      clearAllTimers();
    };
  }, []);

  // When pathname or searchParams change, the new route has finished rendering!
  useEffect(() => {
    const currentKey = `${pathname}?${searchParams?.toString() || ""}`;

    if (!currentUrlRef.current) {
      // First mount
      currentUrlRef.current = currentKey;
      return;
    }

    if (currentUrlRef.current !== currentKey) {
      currentUrlRef.current = currentKey;
      if (stateRef.current.visible) {
        finishNavigation();
      }
    }
  }, [pathname, searchParams]);

  if (!state.visible && state.progress === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[4px] z-[99999] pointer-events-none overflow-hidden transition-opacity duration-200"
      style={{ opacity: state.opacity }}
      aria-hidden="true"
    >
      <div
        className="h-full relative transition-all ease-out"
        style={{
          width: `${state.progress}%`,
          transitionDuration: state.progress === 100 ? "150ms" : "200ms",
          backgroundImage:
            "linear-gradient(90deg, #ef4444 0%, #f97316 16%, #eab308 33%, #10b981 50%, #06b6d4 66%, #3b82f6 83%, #8b5cf6 100%)",
          backgroundSize: "100vw 100%",
        }}
      />
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarContent />
    </Suspense>
  );
}
