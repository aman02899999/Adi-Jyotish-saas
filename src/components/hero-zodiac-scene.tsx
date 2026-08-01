"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Stars } from "@react-three/drei";
import type { Group } from "three";
import { DoubleSide } from "three";

type Sign = { key: string; name: string; symbol: string };

const RING_RADIUS = 2.5;
const PLANET_COLORS = ["#e8b374", "#c9822f", "#d9a35a", "#b97a4a", "#f0c98a", "#a9673f"];

function Sun() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#f3c98a" emissive="#c9822f" emissiveIntensity={1.3} roughness={0.4} />
      </mesh>
      {/* Soft layered glow — cheaper and more reliable across devices than a real bloom pass. */}
      <mesh>
        <sphereGeometry args={[0.78, 24, 24]} />
        <meshBasicMaterial color="#e8a562" transparent opacity={0.16} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.05, 24, 24]} />
        <meshBasicMaterial color="#e8a562" transparent opacity={0.07} />
      </mesh>
      <pointLight color="#f0b876" intensity={26} distance={11} decay={2} />
    </>
  );
}

function OrbitRing() {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[RING_RADIUS - 0.012, RING_RADIUS + 0.012, 96]} />
      <meshBasicMaterial color="#d9a35a" transparent opacity={0.3} side={DoubleSide} />
    </mesh>
  );
}

function ZodiacRing({ signs, onSelect }: { signs: Sign[]; onSelect: (key: string) => void }) {
  const groupRef = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y += delta * 0.09;
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.04;
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.04;
    group.rotation.x = -0.5 + pointer.current.y * 0.14;
    group.rotation.z = pointer.current.x * 0.07;
  });

  return (
    <group ref={groupRef} rotation={[-0.5, 0, 0]}>
      <Sun />
      <OrbitRing />

      {signs.map((sign, index) => {
        const angle = (index / signs.length) * Math.PI * 2;
        const x = Math.cos(angle) * RING_RADIUS;
        const z = Math.sin(angle) * RING_RADIUS;
        return (
          <group key={sign.key} position={[x, 0, z]}>
            {/* Purely decorative — click detection lives on the Html label below, whose hit area
                stays a fixed screen size instead of shrinking with perspective/distance. */}
            <mesh>
              <sphereGeometry args={[0.07, 14, 14]} />
              <meshStandardMaterial color={PLANET_COLORS[index % PLANET_COLORS.length]} emissive={PLANET_COLORS[index % PLANET_COLORS.length]} emissiveIntensity={0.7} roughness={0.5} />
            </mesh>
            <Html center transform={false} occlude={false}>
              {/* Plain text, not the Unicode zodiac glyph: those symbols render as clashing color
                  emoji on iOS/Safari instead of a clean text glyph, which is what actually made
                  the first version of this scene look broken on real phones. */}
              <button type="button" className="zodiac-scene__label" onClick={() => onSelect(sign.key)}>
                {sign.name}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

const STATIC_LABEL_RADIUS = 92;

function StaticWheel({ signs, onSelect }: { signs: Sign[]; onSelect: (key: string) => void }) {
  return (
    <div className="zodiac-scene__static" role="group" aria-label="Zodiac wheel — choose your sign">
      <div className="zodiac-scene__static-sun" aria-hidden="true" />
      <div className="zodiac-scene__static-ring" aria-hidden="true" />
      {signs.map((sign, index) => {
        const angle = (index / signs.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * STATIC_LABEL_RADIUS;
        const y = Math.sin(angle) * STATIC_LABEL_RADIUS;
        return (
          <button
            key={sign.key}
            type="button"
            className="zodiac-scene__static-mark"
            style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
            onClick={() => onSelect(sign.key)}
          >
            {sign.name}
          </button>
        );
      })}
    </div>
  );
}

/** The homepage's signature moment: a real WebGL orbital solar-system scene standing in for "your
 * stars, your story" — a glowing sun with a visible orbit ring and 12 small planet markers, one
 * per zodiac sign. Falls back to a static CSS ring (same click-through behavior) when the browser
 * prefers reduced motion, or until we've confirmed on the client that it's safe to mount a WebGL
 * canvas — SSR always renders the static ring so there's no hydration mismatch. Labels are plain
 * sign names, not the Unicode zodiac glyphs — those render as color emoji on iOS/Safari instead of
 * clean text, which is what made the first pass of this scene look broken on real phones. */
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
          camera={{ position: [0, 1.1, 5.4], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={(state) => state.camera.lookAt(0, 0, 0)}
        >
          <ambientLight intensity={0.45} />
          <Stars radius={30} depth={22} count={mobile ? 380 : 1100} factor={2.3} saturation={0} fade speed={0.35} />
          <ZodiacRing signs={signs} onSelect={handleSelect} />
        </Canvas>
      ) : (
        <StaticWheel signs={signs} onSelect={handleSelect} />
      )}
    </div>
  );
}
