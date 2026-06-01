import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MarqueeProps {
  children: ReactNode;
  className?: string;
  pixelsPerSecond?: number;
  title?: string;
}

export default function Marquee({
  children,
  className,
  pixelsPerSecond = 25,
  title,
}: MarqueeProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    const inner = innerRef.current;

    if (!container || !text || !inner) {
      return undefined;
    }

    const updateOverflow = () => {
      const overflows = text.scrollWidth > container.clientWidth + 1;
      setIsOverflowing(overflows);

      if (overflows) {
        const gap = parseFloat(getComputedStyle(inner).columnGap) || 0;
        const distance = text.scrollWidth + gap;
        const duration = distance / pixelsPerSecond;

        inner.style.setProperty("--marquee-distance", `${distance}px`);
        inner.style.setProperty("--marquee-duration", `${duration}s`);
      } else {
        inner.style.removeProperty("--marquee-distance");
        inner.style.removeProperty("--marquee-duration");
      }
    };

    const resizeObserver = new ResizeObserver(updateOverflow);

    updateOverflow();
    resizeObserver.observe(container);
    resizeObserver.observe(text);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children, pixelsPerSecond]);

  return (
    <span
      ref={containerRef}
      className={cn("music-marquee block min-w-0", className)}
      data-overflow={isOverflowing}
      title={title}
    >
      <span ref={innerRef} className="music-marquee-inner">
        <span ref={textRef} className="min-w-0 truncate">
          {children}
        </span>
        {isOverflowing ? (
          <span aria-hidden="true" className="min-w-0">
            {children}
          </span>
        ) : null}
      </span>
    </span>
  );
}
