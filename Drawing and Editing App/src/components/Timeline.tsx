import { useRef } from 'react'
import { Asset, Clip, TRACKS, clipEnd } from '../lib/model'

const TH = 52
const RH = 28
const LW = 56
const snap = (v: number) => Math.round(v * 20) / 20
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`
export { fmt }

type Props = {
  clips: Clip[]
  assets: Asset[]
  time: number
  setTime: (t: number) => void
  total: number
  pps: number
  selectedId: string | null
  select: (id: string | null) => void
  update: (id: string, patch: Partial<Clip>) => void
}

export default function Timeline({ clips, assets, time, setTime, total, pps, selectedId, select, update }: Props) {
  const area = useRef<HTMLDivElement>(null)

  const drag = (e: React.PointerEvent, move: (dx: number, dy: number) => void) => {
    e.stopPropagation()
    const sx = e.clientX,
      sy = e.clientY
    const m = (ev: PointerEvent) => move(ev.clientX - sx, ev.clientY - sy)
    const u = () => {
      window.removeEventListener('pointermove', m)
      window.removeEventListener('pointerup', u)
    }
    window.addEventListener('pointermove', m)
    window.addEventListener('pointerup', u)
  }

  const scrub = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect()
    const set = (cx: number) => setTime(Math.max(0, Math.min(total, (cx - r.left + area.current!.scrollLeft) / pps)))
    set(e.clientX)
    const m = (ev: PointerEvent) => set(ev.clientX)
    const u = () => {
      window.removeEventListener('pointermove', m)
      window.removeEventListener('pointerup', u)
    }
    window.addEventListener('pointermove', m)
    window.addEventListener('pointerup', u)
  }

  const width = total * pps
  const ticks = Array.from({ length: Math.ceil(total) + 1 }, (_, i) => i)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0 border-r border-line bg-panel" style={{ width: LW }}>
        <div style={{ height: RH }} />
        {Array.from({ length: TRACKS }, (_, i) => (
          <div key={i} style={{ height: TH }} className="flex items-center justify-center border-t border-line font-mono text-[10px] text-mute">
            L{TRACKS - i}
          </div>
        ))}
      </div>
      <div ref={area} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-paper">
        <div className="relative" style={{ width, height: RH + TH * TRACKS }}>
          <div onPointerDown={scrub} className="absolute inset-x-0 top-0 cursor-col-resize bg-panel" style={{ height: RH }}>
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full border-l border-line pl-1 font-mono text-[10px] text-mute" style={{ left: s * pps }}>
                <span className="select-none leading-[28px]">{s}s</span>
              </div>
            ))}
          </div>
          {Array.from({ length: TRACKS }, (_, row) => (
            <div
              key={row}
              onPointerDown={(e) => {
                select(null)
                scrub(e)
              }}
              className="absolute inset-x-0 border-t border-line"
              style={{ top: RH + row * TH, height: TH }}
            />
          ))}
          {clips.map((c) => {
            const a = assets.find((x) => x.id === c.assetId)
            if (!a) return null
            const row = TRACKS - 1 - c.track
            const sel = c.id === selectedId
            return (
              <div
                key={c.id}
                onPointerDown={(e) => {
                  select(c.id)
                  const o = { s: c.start, t: c.track }
                  drag(e, (dx, dy) =>
                    update(c.id, {
                      start: Math.max(0, snap(o.s + dx / pps)),
                      track: Math.max(0, Math.min(TRACKS - 1, o.t - Math.round(dy / TH))),
                    }),
                  )
                }}
                className={`absolute flex cursor-grab items-center gap-2 overflow-hidden rounded-md border-2 px-2 active:cursor-grabbing ${sel ? 'z-10 border-accent bg-[#ffe3da]' : 'border-ink/80 bg-panel2 hover:bg-[#e4e1da]'}`}
                style={{ left: c.start * pps, width: Math.max(8, c.dur * pps), top: RH + row * TH + 4, height: TH - 8 }}
              >
                <div
                  onPointerDown={(e) => {
                    select(c.id)
                    const o = { ...c }
                    drag(e, (dx) => {
                      let d = snap(dx / pps)
                      d = Math.max(-o.start, -o.offset / o.speed, Math.min(o.dur - 0.2, d))
                      update(c.id, { start: o.start + d, dur: o.dur - d, offset: o.offset + d * o.speed })
                    })
                  }}
                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-ink/70"
                />
                <img src={a.frames[0]} alt="" className="checker pointer-events-none h-8 w-8 shrink-0 rounded bg-white" draggable={false} />
                <span className="pointer-events-none truncate text-xs font-medium">{a.name}</span>
                {c.speed !== 1 && (
                  <span className="pointer-events-none ml-auto shrink-0 rounded-full bg-ink px-1.5 py-0.5 font-mono text-[9px] text-white">
                    {c.speed}x
                  </span>
                )}
                <div
                  onPointerDown={(e) => {
                    select(c.id)
                    const o = c.dur
                    drag(e, (dx) => update(c.id, { dur: Math.max(0.2, snap(o + dx / pps)) }))
                  }}
                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-ink/70"
                />
              </div>
            )
          })}
          <div className="pointer-events-none absolute top-0 z-20 w-px bg-accent" style={{ left: time * pps, height: RH + TH * TRACKS }}>
            <div className="-ml-[5px] h-3 w-[11px] rounded-b-sm bg-accent" />
          </div>
        </div>
      </div>
    </div>
  )
}

export { clipEnd }
