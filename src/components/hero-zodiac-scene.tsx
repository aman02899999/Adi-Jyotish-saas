"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Stars } from "@react-three/drei";
import type { Group } from "three";

type Sign = { key: string; name: string; symbol: string };

const RING_RADIUS = 3.05;

function ZodiacRing({ signs, onSelect }: { signs: Sign[]; onSelect: (key: string) => void }) {
  const groupRef = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y += delta * 0.1;
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.04;
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.04;
    group.rotation.x = -0.56 + pointer.current.y * 0.14;
    group.rotation.z = pointer.current.x * 0.07;
  });

  return (
    <group ref={groupRef} rotation={[-0.56, 0, 0]}>
      <mesh>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color="#e8b374" emissive="#c9822f" emissiveIntensity={1.15} roughness={0.35} metalness={0.2} />
      </mesh>
      <pointLight color="#f0b876" intensity={22} distance={10} decay={2} />

      {signs.map((sign, index) => {
        const angle = (index / signs.length) * Math.PI * 2;
        const x = Math.cos(angle) * RING_RADIUS;
        const z = Math.sin(angle) * RING_RADIUS;
        return (
          <group key={sign.key} position={[x, 0, z]}>
            {/* Purely decorative glow — click detection lives on the Html button below, which has
                a stable screen-space hit area instead of one that shrinks with perspective/distance. */}
            <mesh>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshStandardMaterial color="#f3e6d0" emissive="#c9822f" emissiveIntensity={0.9} roughness={0.4} />
            </mesh>
            <Html center transform={false} occlude={false}>
              <button type="button" className="zodiac-scene__glyph" onClick={() => onSelect(sign.key)} aria-label={sign.name}>
                {sign.symbol}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function StaticWheel({ signs, onSelect }: { signs: Sign[]; onSelect: (key: string) => void }) {
  return (
    <div className="zodiac-scene__static" role="group" aria-label="Zodiac wheel — choose your sign">
      <div className="zodiac-scene__static-sun" aria-hidden="true" />
      {signs.map((sign, index) => {
        const angle = (index / signs.length) * 360;
        return (
          <button
            key={sign.key}
            type="button"
            className="zodiac-scene__static-mark"
            style={{ transform: `rotate(${angle}deg) translate(0, -120px) rotate(${-angle}deg)` }}
            onClick={() => onSelect(sign.key)}
          >
            <span aria-hidden="true">{sign.symbol}</span>
            <em>{sign.name}</em>
          </button>
        );
      })}
    </div>
  );
}

/** The homepage's signature moment: a real WebGL orbital zodiac wheel standing in for "your stars,
 * your story." Falls back to a static CSS ring (same click-through behavior) when the browser
 * prefers reduced motion, or until we've confirmed on the client that it's safe to mount a WebGL
 * canvas — SSR always renders the static ring so there's no hydration mismatch. */
export function HeroZodiacScene({ signs }: { signs: Sign[] }) {
  const router = useRouter();
  const [{ mode, mobile }, setClientState] = useState<{ mode: "static" | "scene"; mobile: boolean }>({ mode: "static", mobile: false });

  useEffect(() => {
    // One-time read of browser environment (matchMedia/innerWidth) to decide whether to mount the
    // WebGL scene. SSR has no `window`, so this can't be a lazy useState initializer, and there's
    // nothing to subscribe to — we only need the value once, at mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClientState({
      mode: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "static" : "scene",
      mobile: window.innerWidth < 760,
    });
  }, []);

  function handleSelect(key: string) {
    router.push(`/horoscope?sign=${key}`);
  }

  return (
    <div className="zodiac-scene">
      {mode === "scene" ? (
        <Canvas
          className="zodiac-scene__canvas"
          dpr={mobile ? 1 : [1, 1.6]}
          camera={{ position: [0, 1.35, 6.3], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={(state) => state.camera.lookAt(0, 0, 0)}
        >
          <ambientLight intensity={0.4} />
          <Stars radius={30} depth={22} count={mobile ? 320 : 1000} factor={2.3} saturation={0} fade speed={0.35} />
          <ZodiacRing signs={signs} onSelect={handleSelect} />
        </Canvas>
      ) : (
        <StaticWheel signs={signs} onSelect={handleSelect} />
      )}
    </div>
  );
}
