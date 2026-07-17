"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const REFRESH_THRESHOLD = 68;
const MAX_PULL_DISTANCE = 92;

export function PullToRefresh({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const pullingRef = useRef(false);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const supportsTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!supportsTouch) return;

    const isAtTop = () => {
      const documentTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      return scrollElement.scrollTop <= 0 && documentTop <= 0;
    };

    const reset = () => {
      pullingRef.current = false;
      distanceRef.current = 0;
      setIsPulling(false);
      setDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshing || event.touches.length !== 1 || !isAtTop()) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      startRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      pullingRef.current = true;
      setIsPulling(true);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || event.touches.length !== 1) return;
      if (!isAtTop()) {
        reset();
        return;
      }

      const deltaX = event.touches[0].clientX - startRef.current.x;
      const deltaY = event.touches[0].clientY - startRef.current.y;

      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        reset();
        return;
      }

      event.preventDefault();
      const dampedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.48);
      distanceRef.current = dampedDistance;
      setDistance(dampedDistance);
    };

    const handleTouchEnd = () => {
      if (!pullingRef.current) return;

      const shouldRefresh = distanceRef.current >= REFRESH_THRESHOLD;
      pullingRef.current = false;
      setIsPulling(false);

      if (!shouldRefresh) {
        reset();
        return;
      }

      setRefreshing(true);
      setDistance(54);
      window.setTimeout(() => window.location.reload(), 220);
    };

    scrollElement.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollElement.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollElement.addEventListener("touchend", handleTouchEnd, { passive: true });
    scrollElement.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      scrollElement.removeEventListener("touchstart", handleTouchStart);
      scrollElement.removeEventListener("touchmove", handleTouchMove);
      scrollElement.removeEventListener("touchend", handleTouchEnd);
      scrollElement.removeEventListener("touchcancel", reset);
    };
  }, [refreshing]);

  const ready = distance >= REFRESH_THRESHOLD;

  return (
    <div ref={scrollRef} className={cn("relative", className)}>
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.75rem)] z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg transition-opacity duration-150 lg:hidden",
          distance > 8 || refreshing ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translate(-50%, ${Math.max(0, distance - 20)}px)` }}
      >
        {refreshing ? (
          <RefreshCw className="size-4 animate-spin text-indigo-600" />
        ) : (
          <ArrowDown
            className={cn(
              "size-4 text-indigo-600 transition-transform",
              ready && "rotate-180",
            )}
          />
        )}
        <span>
          {refreshing
            ? "Actualitzant..."
            : ready
              ? "Deixa anar per actualitzar"
              : "Llisca per actualitzar"}
        </span>
      </div>

      <div
        className="transition-transform duration-150 ease-out"
        style={{
          transform: distance > 0 ? `translateY(${distance}px)` : undefined,
          transitionDuration: isPulling ? "0ms" : "150ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
