import { Component, For, createSignal, Show } from 'solid-js';
import type { Color } from '../../shared/types';

export interface AnimatingChecker {
  id: number;
  color: Color;
  mode: 'slide' | 'hop';
  // Slide mode
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  started: boolean;
  // Hop mode
  waypoints?: { x: number; y: number }[];
  currentX?: number;
  currentY?: number;
  startTime?: number;
}

/** A captured checker that lingers, then rises toward board center while fading */
interface CapturedChecker {
  id: number;
  color: Color;
  x: number;
  y: number;
  phase: 'waiting' | 'impact' | 'rising';
  currentY: number;
  opacity: number;
  scale: number;
}

const COLORS = {
  checkerWhite: '#e8dcc8',
  checkerWhiteBorder: '#c4b8a4',
  checkerBlack: '#2c2c2c',
  checkerBlackBorder: '#1a1a1a',
};

const CHECKER_R = 22;
export const ANIM_DURATION = 550;
export const HOP_DURATION = 130;
const ARC_HEIGHT = 25;

let nextId = 0;

const [animations, setAnimations] = createSignal<AnimatingChecker[]>([]);
const [capturedCheckers, setCapturedCheckers] = createSignal<CapturedChecker[]>([]);

// Points where a checker just landed — hide the top checker there until animation ends
const [hiddenDests, setHiddenDests] = createSignal<Set<number>>(new Set());

export function getHiddenDests(): Set<number> {
  return hiddenDests();
}

function addHiddenDest(point: number, duration: number) {
  setHiddenDests(prev => new Set([...prev, point]));
  setTimeout(() => {
    setHiddenDests(prev => {
      const next = new Set(prev);
      next.delete(point);
      return next;
    });
  }, duration);
}

const BOARD_CENTER_Y = 320;
const CAPTURE_RISE_DURATION = 500; // total rise+fade: 0.5s
const CAPTURE_IMPACT_DURATION = 100; // brief impact pulse

/**
 * Captured checker: lingers at position, impact glow when hit,
 * then rises toward board center while fading away (0.5s).
 */
export function triggerCapture(
  x: number, y: number,
  _barX: number, _barY: number,
  capturedColor: Color,
  delay: number,
) {
  // Dedup: don't create another capture at the same position
  const existing = capturedCheckers();
  if (existing.some(c => Math.abs(c.x - x) < 5 && Math.abs(c.y - y) < 5)) return;

  const id = nextId++;

  const cap: CapturedChecker = {
    id, color: capturedColor, x, y,
    phase: 'waiting', currentY: y, opacity: 1, scale: 1,
  };
  setCapturedCheckers(prev => [...prev, cap]);

  // Phase 2: impact when capturing checker arrives
  setTimeout(() => {
    setCapturedCheckers(prev => prev.map(c =>
      c.id === id ? { ...c, phase: 'impact' as const, scale: 1.15 } : c
    ));

    // Phase 3: rise toward center while fading
    setTimeout(() => {
      setCapturedCheckers(prev => prev.map(c =>
        c.id === id ? { ...c, phase: 'rising' as const } : c
      ));

      const startTime = performance.now();
      const startY = y;
      // Direction: toward center. Top checkers float down, bottom float up.
      const targetY = BOARD_CENTER_Y;

      function tick() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / CAPTURE_RISE_DURATION, 1);
        // Ease-out for smooth deceleration
        const ease = 1 - Math.pow(1 - t, 2);

        const currentY = startY + (targetY - startY) * ease;
        const opacity = 1 - t; // linear fade to 0
        const scale = 1.15 - 0.15 * ease; // shrink from 1.15 back to 1

        setCapturedCheckers(prev => prev.map(c =>
          c.id === id ? { ...c, currentY, opacity, scale } : c
        ));

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          setCapturedCheckers(prev => prev.filter(c => c.id !== id));
        }
      }

      requestAnimationFrame(tick);
    }, CAPTURE_IMPACT_DURATION);
  }, delay);
}

export function triggerAnimation(
  fromX: number, fromY: number,
  toX: number, toY: number,
  color: Color,
  destPoint?: number,
) {
  if (destPoint !== undefined) addHiddenDest(destPoint, ANIM_DURATION);

  const id = nextId++;
  const anim: AnimatingChecker = {
    id, color, mode: 'slide',
    fromX, fromY, toX, toY, started: false,
  };
  setAnimations(prev => [...prev, anim]);

  requestAnimationFrame(() => {
    setAnimations(prev => prev.map(a => a.id === id ? { ...a, started: true } : a));
  });

  setTimeout(() => {
    setAnimations(prev => prev.filter(a => a.id !== id));
  }, ANIM_DURATION + 50);
}

/** Bunny hop: checker hops through waypoints with arc motion */
export function triggerBunnyHop(
  waypoints: { x: number; y: number }[],
  color: Color,
  destPoint?: number,
): number {
  const id = nextId++;
  const totalDuration = (waypoints.length - 1) * HOP_DURATION;
  if (destPoint !== undefined) addHiddenDest(destPoint, totalDuration);
  const startTime = performance.now();

  const anim: AnimatingChecker = {
    id, color, mode: 'hop',
    fromX: waypoints[0].x, fromY: waypoints[0].y,
    toX: waypoints[waypoints.length - 1].x, toY: waypoints[waypoints.length - 1].y,
    started: true,
    waypoints,
    currentX: waypoints[0].x,
    currentY: waypoints[0].y,
    startTime,
  };
  setAnimations(prev => [...prev, anim]);

  function tick() {
    const elapsed = performance.now() - startTime;
    if (elapsed >= totalDuration) {
      // Snap to final position then remove
      setAnimations(prev => prev.map(a =>
        a.id === id ? { ...a, currentX: waypoints[waypoints.length - 1].x, currentY: waypoints[waypoints.length - 1].y } : a
      ));
      setTimeout(() => setAnimations(prev => prev.filter(a => a.id !== id)), 30);
      return;
    }

    const segIndex = Math.min(Math.floor(elapsed / HOP_DURATION), waypoints.length - 2);
    const t = (elapsed - segIndex * HOP_DURATION) / HOP_DURATION;
    const w0 = waypoints[segIndex];
    const w1 = waypoints[segIndex + 1];

    const x = w0.x + (w1.x - w0.x) * t;
    const yLinear = w0.y + (w1.y - w0.y) * t;
    const y = yLinear - ARC_HEIGHT * Math.sin(Math.PI * t);

    setAnimations(prev => prev.map(a =>
      a.id === id ? { ...a, currentX: x, currentY: y } : a
    ));

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
  return totalDuration;
}

export function clearAnimations() {
  setAnimations([]);
  setCapturedCheckers([]);
  setHiddenDests(new Set<number>());
}

const MoveAnimation: Component = () => {
  return (
    <g class="move-animation-layer">
      {/* Captured checkers: linger, impact glow, rise toward center while fading */}
      <For each={capturedCheckers()}>
        {(cap) => {
          const fill = cap.color === 'w' ? COLORS.checkerWhite : COLORS.checkerBlack;
          const stroke = cap.color === 'w' ? COLORS.checkerWhiteBorder : COLORS.checkerBlackBorder;

          return (
            <circle
              cx={cap.x}
              cy={cap.currentY}
              r={CHECKER_R * cap.scale}
              fill={fill}
              stroke={cap.phase === 'impact' || cap.phase === 'rising' ? '#ff6666' : stroke}
              stroke-width={cap.phase === 'impact' ? 2.5 : 1.5}
              opacity={cap.opacity}
              style={{
                filter: cap.phase === 'impact'
                  ? 'drop-shadow(0 0 10px rgba(255,100,100,0.6))'
                  : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
              }}
            />
          );
        }}
      </For>

      {/* Moving checkers */}
      <For each={animations()}>
        {(anim) => {
          const fill = anim.color === 'w' ? COLORS.checkerWhite : COLORS.checkerBlack;
          const stroke = anim.color === 'w' ? COLORS.checkerWhiteBorder : COLORS.checkerBlackBorder;

          if (anim.mode === 'hop') {
            return (
              <circle
                cx={anim.currentX ?? anim.fromX}
                cy={anim.currentY ?? anim.fromY}
                r={CHECKER_R}
                fill={fill}
                stroke={stroke}
                stroke-width={1.5}
                class="checker-anim"
                style={{
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
                }}
              />
            );
          }

          // Slide mode
          const x = anim.started ? anim.toX : anim.fromX;
          const y = anim.started ? anim.toY : anim.fromY;
          return (
            <circle
              cx={x}
              cy={y}
              r={CHECKER_R}
              fill={fill}
              stroke={stroke}
              stroke-width={1.5}
              class="checker-anim"
              style={{
                transition: `cx ${ANIM_DURATION}ms ease-out, cy ${ANIM_DURATION}ms ease-out`,
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
              }}
            />
          );
        }}
      </For>
    </g>
  );
};

export default MoveAnimation;
