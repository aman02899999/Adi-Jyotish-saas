"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/** Subtle pointer-driven 3D tilt + lift for a card. Wraps existing markup without touching its
 * own classes/behavior — this only adds the perspective transform on the outer shell. */
export function TiltCard({ children, className = "", strength = 9 }: { children: ReactNode; className?: string; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [strength, -strength]), { stiffness: 220, damping: 22 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-strength, strength]), { stiffness: 220, damping: 22 });
  const lift = useSpring(0, { stiffness: 220, damping: 22 });

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((event.clientX - rect.left) / rect.width);
    y.set((event.clientY - rect.top) / rect.height);
    lift.set(-6);
  }

  function handleLeave() {
    x.set(0.5);
    y.set(0.5);
    lift.set(0);
  }

  return (
    <motion.div
      ref={ref}
      className={`tilt-card ${className}`}
      style={{ rotateX, rotateY, y: lift, transformPerspective: 900 }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {children}
    </motion.div>
  );
}
