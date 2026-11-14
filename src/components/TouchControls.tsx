import React, { useRef, useState } from 'react';

type Who = 'mom' | 'baby';

interface TouchControlsProps {
  onSteer: (who: Who, turn: number, forward: number) => void;
  onVertical: (who: Who, dir: number) => void;
  onSing: (who: Who) => void;
  onRoll: (who: Who) => void;
  onMunch: () => void;
}

const PAD_SIZE = 132;
const KNOB_TRAVEL = 44;

/** One thumb-stick: drag to steer, release to stop. Each stick tracks its own finger. */
function Joystick({ label, onChange }: { label: string; onChange: (x: number, y: number) => void }) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const activePointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: React.PointerEvent) => {
    const rect = padRef.current!.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > KNOB_TRAVEL) {
      dx = (dx / len) * KNOB_TRAVEL;
      dy = (dy / len) * KNOB_TRAVEL;
    }
    setKnob({ x: dx, y: dy });
    // Small dead zone so a resting thumb does not make the turtle creep.
    const nx = Math.abs(dx) < 6 ? 0 : dx / KNOB_TRAVEL;
    const ny = Math.abs(dy) < 6 ? 0 : -dy / KNOB_TRAVEL;
    onChange(nx, ny);
  };

  const release = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div
      ref={padRef}
      role="application"
      aria-label={`${label} steering stick`}
      onPointerDown={(e) => {
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (activePointer.current === e.pointerId) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="relative rounded-full bg-slate-950/55 border border-teal-300/40 shadow-xl"
      style={{ width: PAD_SIZE, height: PAD_SIZE, touchAction: 'none' }}
    >
      <span className="absolute -top-5 left-0 right-0 text-center text-[11px] font-semibold text-teal-100 drop-shadow">
        {label}
      </span>
      <div
        className="absolute rounded-full bg-teal-300/85 border border-white/60 shadow-lg"
        style={{
          width: 56,
          height: 56,
          left: PAD_SIZE / 2 - 28 + knob.x,
          top: PAD_SIZE / 2 - 28 + knob.y,
        }}
      />
    </div>
  );
}

function HoldButton({
  label,
  ariaLabel,
  onHold,
}: {
  label: string;
  ariaLabel: string;
  onHold: (held: boolean) => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
      className="w-14 h-14 rounded-2xl bg-slate-950/65 border border-sky-300/40 text-xl text-sky-100 active:bg-sky-500/50"
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );
}

function TapButton({ label, onTap }: { label: string; onTap: () => void }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
      className="px-3 h-11 rounded-xl bg-slate-950/65 border border-amber-300/40 text-xs font-semibold text-amber-100 active:bg-amber-500/40"
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );
}

/**
 * On-screen controls for phones and tablets. Mom on the left, Baby on the right, so two
 * people can share one tablet. Leave the Baby stick alone and she follows Mom by herself.
 */
export function TouchControls({ onSteer, onVertical, onSing, onRoll, onMunch }: TouchControlsProps) {
  const side = (who: Who, label: string, mirrored: boolean) => (
    <div className={`flex items-end gap-3 ${mirrored ? 'flex-row-reverse' : ''}`}>
      <Joystick label={label} onChange={(x, y) => onSteer(who, x, y)} />
      <div className="flex flex-col gap-2">
        <HoldButton
          label="▲"
          ariaLabel={`${label} swim up`}
          onHold={(held) => onVertical(who, held ? 1 : 0)}
        />
        <HoldButton
          label="▼"
          ariaLabel={`${label} dive down`}
          onHold={(held) => onVertical(who, held ? -1 : 0)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <TapButton label="Sing" onTap={() => onSing(who)} />
        <TapButton label="Roll" onTap={() => onRoll(who)} />
        {who === 'mom' && <TapButton label="Munch" onTap={onMunch} />}
      </div>
    </div>
  );

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-4 pointer-events-none select-none"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto">{side('mom', 'Mom', false)}</div>
      <div className="pointer-events-auto">{side('baby', 'Baby', true)}</div>
    </div>
  );
}
