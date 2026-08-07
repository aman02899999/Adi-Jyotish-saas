"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Sparkles, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { Group } from "three";
import { DoubleSide } from "three";

type Sign = { key: string; name: string; symbol: string };

const PLANET_COLORS = ["#e8b374", "#c9822f", "#d9a35a", "#b97a4a", "#f0c98a", "#a9673f", "#e2985f", "#c68a4e"];
const ORBITS = [
  { radius: 1.5, speed: 0.16, size: 0.06 },
  { radius: 2.15, speed: 0.1, size: 0.075 },
  { radius: 2.85, speed: 0.065, size: 0.09 },
];

function Sun() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#f3c98a" emissive="#c9822f" emissiveIntensity={1.4} roughness={0.4} />
      </mesh>
      {/* Soft layered glow — atmosphere for devices where bloom is skipped (mobile). */}
      <mesh>
        <sphereGeometry args={[0.78, 24, 24]} />
        <meshBasicMaterial color="#e8a562" transparent opacity={0.16} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.05, 24, 24]} />
        <meshBasicMaterial color="#e8a562" transparent opacity={0.07} />
      </mesh>
      <pointLight color="#f0b876" intensity={26} distance={12} decay={2} />
    </>
  );
}

type OrbitPlanet = { sign: Sign; angle: number; color: string };

function OrbitGroup({ radius, speed, size, planets, onSelect }: { radius: number; speed: number; size: number; planets: OrbitPlanet[]; onSelect: (key: string) => void }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * speed;
  });

  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.01, radius + 0.01, 96]} />
        <meshBasicMaterial color="#d9a35a" transparent opacity={0.28} side={DoubleSide} />
      </mesh>
      {planets.map(({ sign, angle, color }) => {
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <group key={sign.key} position={[x, 0, z]}>
            {/* Purely decorative — click detection lives on the Html label below, whose hit area
                stays a fixed screen size instead of shrinking with perspective/distance. */}
            <mesh>
              <sphereGeometry args={[size, 16, 16]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.5} />
            </mesh>
            <Html center transform={false} occlude={false}>
              {/* Plain text, not the Unicode zodiac glyph: those symbols render as clashing color
                  emoji on iOS/Safari instead of a clean text glyph. */}
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

function buildOrbits(signs: Sign[]) {
  return ORBITS.map((orbit, orbitIndex) => {
    const planetsInOrbit = signs.filter((_, i) => i % ORBITS.length === orbitIndex);
    const planets: OrbitPlanet[] = planetsInOrbit.map((sign, i) => ({
      sign,
      angle: (i / planetsInOrbit.length) * Math.PI * 2 + orbitIndex * 0.6,
      color: PLANET_COLORS[(orbitIndex * 4 + i) % PLANET_COLORS.length],
    }));
    return { ...orbit, planets };
  });
}

function SolarSystem({ signs, onSelect }: { signs: Sign[]; onSelect: (key: string) => void }) {
  const groupRef = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const orbits = useMemo(() => buildOrbits(signs), [signs]);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.04;
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.04;
    group.rotation.x = -0.5 + pointer.current.y * 0.14;
    group.rotation.z = pointer.current.x * 0.07;
  });

  return (
    <group ref={groupRef} rotation={[-0.5, 0, 0]}>
      <Sun />
      {orbits.map((orbit) => (
        <OrbitGroup key={orbit.radius} radius={orbit.radius} speed={orbit.speed} size={orbit.size} planets={orbit.planets} onSelect={onSelect} />
      ))}
    </group>
  );
}

const STATIC_LABEL_RADIUS = 92;

// Formats a signed pixel offset for a `calc(50% ...)` expression with a fixed 2-decimal precision.
// Plain string interpolation of `Math.cos()`/`Math.sin()` results produces things like
// "calc(50% + -46.00000000000002px)" — valid CSS, but the browser re-serializes it to
// "calc(50% - 46px)" when reflecting the style back, which React's hydration check then flags as
// a server/client mismatch even though the rendered position is identical.
function offsetTerm(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded >= 0 ? `+ ${rounded}px` : `- ${Math.abs(rounded)}px`;
}

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
            style={{ left: `calc(50% ${offsetTerm(x)})`, top: `calc(50% ${offsetTerm(y)})` }}
            onClick={() => onSelect(sign.key)}
          >
            {sign.name}
          </button>
        );
      })}
    </div>
  );
}

/** The homepage's signature moment: a real WebGL solar-system scene standing in for "your stars,
 * your story" — a glowing sun, three visible orbit rings at different radii/speeds (echoing real
 * planetary motion), and 12 small planet markers, one per zodiac sign. Falls back to a static CSS
 * ring (same click-through behavior) when the browser prefers reduced motion, or until we've
 * confirmed on the client that it's safe to mount a WebGL canvas — SSR always renders the static
 * ring so there's no hydration mismatch. Labels are plain sign names, not the Unicode zodiac
 * glyphs — those render as color emoji on iOS/Safari instead of clean text. Bloom post-processing
 * (real light glow, not a faked halo) is desktop-only to keep the mobile GPU budget sane. */
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
          dpr={mobile ? 1 : [1, 1.8]}
          camera={{ position: [0, 1.15, 5.6], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={(state) => state.camera.lookAt(0, 0, 0)}
        >
          <ambientLight intensity={0.45} />
          <Stars radius={30} depth={22} count={mobile ? 380 : 1100} factor={2.3} saturation={0} fade speed={0.35} />
          <Sparkles count={mobile ? 20 : 60} scale={[3.6, 1.4, 3.6]} size={2.4} speed={0.25} opacity={0.5} color="#f3d9ad" />
          <SolarSystem signs={signs} onSelect={handleSelect} />
          {!mobile && (
            <EffectComposer>
              <Bloom luminanceThreshold={0.22} luminanceSmoothing={0.9} intensity={0.85} radius={0.6} mipmapBlur />
            </EffectComposer>
          )}
        </Canvas>
      ) : (
        <StaticWheel signs={signs} onSelect={handleSelect} />
      )}
    </div>
  );
}
