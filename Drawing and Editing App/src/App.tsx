import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DrawStudio from './components/DrawStudio'
import Timeline, { fmt } from './components/Timeline'
import {
  Asset,
  Clip,
  H,
  Motion,
  TRACKS,
  W,
  blankFrame,
  clipEnd,
  hitTest,
  renderScene,
  seedAssets,
  seedClips,
  uid,
} from './lib/model'

const lbl = 'font-mono text-[10px] uppercase tracking-[0.12em] text-mute'
const btn =
  'h-9 rounded-md border border-line px-3 font-mono text-[10px] uppercase tracking-wider transition hover:bg-panel2 disabled:opacity-40 disabled:hover:bg-transparent'
const BGS = ['#f2efe8', '#ffffff', '#111111', '#ffd84a', '#bfe3f5', '#f7b7c6']
const MOTIONS: Motion[] = ['none', 'bounce', 'spin', 'float', 'pulse', 'fadein']
const SPEEDS = [0.25, 0.5, 1, 2, 3, 4]

export default function App() {
  const [assets, setAssets] = useState<Asset[]>(seedAssets)
  const [clips, setClips] = useState<Clip[]>(seedClips)
  const [mode, setMode] = useState<'draw' | 'edit'>('edit')
  const [drawId, setDrawId] = useState('seed-blob')
  const [sel, setSel] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [bg, setBg] = useState(BGS[0])
  const [zoom, setZoom] = useState(90)
  const [exporting, setExporting] = useState(false)
  const [, bump] = useState(0)

  const stage = useRef<HTMLCanvasElement>(null)
  const end = Math.max(1, ...clips.map(clipEnd))
  const total = Math.max(12, Math.ceil(end) + 2)
  const endRef = useRef(end)
  endRef.current = end
  const loopRef = useRef(loop)
  loopRef.current = loop
  const onEnd = useRef<(() => void) | null>(null)

  const selected = clips.find((c) => c.id === sel) ?? null
  const drawAsset = assets.find((a) => a.id === drawId) ?? assets[0]

  const update = useCallback((id: string, patch: Partial<Clip>) => setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))), [])

  useEffect(() => {
    if (mode !== 'edit') return
    const g = stage.current?.getContext('2d')
    if (!g) return
    renderScene(g, { assets, clips, t: time, bg, selectedId: exporting ? null : sel, onLoad: () => bump((n) => n + 1) })
  }, [assets, clips, time, bg, sel, mode, exporting])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setTime((t) => {
        const n = t + dt
        if (n >= endRef.current) {
          if (loopRef.current && !onEnd.current) return 0
          setPlaying(false)
          queueMicrotask(() => {
            onEnd.current?.()
            onEnd.current = null
          })
          return endRef.current
        }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const togglePlay = () => {
    if (!playing && time >= end - 0.01) setTime(0)
    setPlaying((p) => !p)
  }

  const addToTimeline = (a: Asset) => {
    const used = new Set(clips.filter((c) => time < clipEnd(c) && time + 2 > c.start).map((c) => c.track))
    let track = 0
    while (used.has(track) && track < TRACKS - 1) track++
    const c: Clip = {
      id: uid(), assetId: a.id, track, start: Math.round(time * 20) / 20, dur: 3, offset: 0, speed: 1,
      x: 0.5, y: 0.5, scale: 1, rot: 0, opacity: 1, motion: 'none',
    }
    setClips((cs) => [...cs, c])
    setSel(c.id)
  }

  const newAsset = () => {
    const a: Asset = { id: uid(), name: `Drawing ${assets.length + 1}`, frames: [blankFrame()], fps: 8 }
    setAssets((as) => [...as, a])
    setDrawId(a.id)
    setMode('draw')
  }

  const split = () => {
    if (!selected || time <= selected.start + 0.1 || time >= clipEnd(selected) - 0.1) return
    const d = time - selected.start
    const right: Clip = { ...selected, id: uid(), start: time, dur: selected.dur - d, offset: selected.offset + d * selected.speed }
    setClips((cs) => cs.map((c) => (c.id === selected.id ? { ...c, dur: d } : c)).concat(right))
    setSel(right.id)
  }
  const dup = () => {
    if (!selected) return
    const c = { ...selected, id: uid(), start: clipEnd(selected), track: selected.track }
    setClips((cs) => [...cs, c])
    setSel(c.id)
  }
  const del = () => {
    if (!selected) return
    setClips((cs) => cs.filter((c) => c.id !== selected.id))
    setSel(null)
  }
  const setSpeed = (s: number) => {
    if (!selected) return
    const sourceLen = selected.dur * selected.speed
    update(selected.id, { speed: s, dur: Math.max(0.2, Math.round((sourceLen / s) * 20) / 20) })
  }

  const kb = useRef({ togglePlay, split, del, mode })
  kb.current = { togglePlay, split, del, mode }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (kb.current.mode !== 'edit' || ['INPUT', 'TEXTAREA'].includes(t.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); kb.current.togglePlay() }
      if (e.key === 's') kb.current.split()
      if (e.key === 'Delete' || e.key === 'Backspace') kb.current.del()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const stagePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = stage.current!
    const r = cv.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const hit = hitTest(clips, time, px, py)
    setSel(hit?.id ?? null)
    if (!hit) return
    const o = { x: hit.x, y: hit.y }
    const m = (ev: PointerEvent) =>
      update(hit.id, { x: o.x + (ev.clientX - e.clientX) / r.width, y: o.y + (ev.clientY - e.clientY) / r.height })
    const u = () => {
      window.removeEventListener('pointermove', m)
      window.removeEventListener('pointerup', u)
    }
    window.addEventListener('pointermove', m)
    window.addEventListener('pointerup', u)
  }

  const exportVideo = () => {
    const cv = stage.current!
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' })
    const parts: Blob[] = []
    rec.ondataavailable = (e) => parts.push(e.data)
    rec.onstop = () => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }))
      a.download = 'scribblecut.webm'
      a.click()
      setExporting(false)
    }
    setExporting(true)
    setPlaying(false)
    setTime(0)
    onEnd.current = () => setTimeout(() => rec.stop(), 150)
    setTimeout(() => {
      rec.start()
      setPlaying(true)
    }, 100)
  }

  const bin = useMemo(
    () =>
      assets.map((a) => (
        <div
          key={a.id}
          onClick={() => {
            setDrawId(a.id)
            if (mode === 'edit') addToTimeline(a)
          }}
          className={`group relative flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition ${mode === 'draw' && drawId === a.id ? 'border-ink bg-panel' : 'border-line hover:bg-panel'}`}
        >
          <img src={a.frames[0]} alt={a.name} className="checker h-14 w-14 rounded-md border border-line" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{a.name}</div>
            <div className={lbl}>{a.frames.length}f · {a.fps}fps</div>
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase text-accent opacity-0 transition group-hover:opacity-100">
            {mode === 'edit' ? '+ Add' : 'Draw'}
          </span>
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, mode, drawId, time, clips],
  )

  const slider = (label: string, value: number, min: number, max: number, step: number, key: keyof Clip, show: string) => (
    <div>
      <div className="flex justify-between">
        <span className={lbl}>{label}</span>
        <span className="font-mono text-[10px]">{show}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => update(selected!.id, { [key]: +e.target.value })}
        className="w-full"
      />
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line px-5">
        <div className="font-display text-2xl italic leading-none">
          Scribble<span className="text-accent">cut</span>
        </div>
        <nav className="flex rounded-full border border-line p-0.5">
          {(['draw', 'edit'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setPlaying(false) }}
              className={`rounded-full px-5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${mode === m ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}
            >
              {m === 'draw' ? '01 Draw' : '02 Edit'}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button className={btn} onClick={newAsset}>+ New drawing</button>
          <button
            className="h-9 rounded-md bg-accent px-4 font-mono text-[10px] uppercase tracking-wider text-white transition hover:brightness-95 disabled:opacity-50"
            onClick={exportVideo}
            disabled={mode !== 'edit' || exporting || typeof MediaRecorder === 'undefined'}
          >
            {exporting ? 'Recording…' : 'Export .webm'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-line p-3 max-[1000px]:w-48">
          <div className="flex items-baseline justify-between px-1 pb-1">
            <span className={lbl}>Asset bin</span>
            <span className="font-display text-lg italic text-mute">{assets.length}</span>
          </div>
          {bin}
          <button onClick={newAsset} className="rounded-lg border border-dashed border-mute/50 py-5 text-sm text-mute transition hover:border-ink hover:text-ink">
            Draw something new
          </button>
        </aside>

        {mode === 'draw' ? (
          <main className="min-w-0 flex-1">
            <DrawStudio asset={drawAsset} onChange={(a) => setAssets((as) => as.map((x) => (x.id === a.id ? a : x)))} />
          </main>
        ) : (
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <section className="flex min-w-0 flex-1 flex-col bg-panel p-5">
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <canvas
                    ref={stage}
                    width={W}
                    height={H}
                    onPointerDown={stagePointer}
                    className="max-h-full max-w-full cursor-move touch-none rounded-lg border border-line shadow-[0_24px_60px_-34px_rgba(0,0,0,0.45)]"
                    style={{ aspectRatio: `${W}/${H}` }}
                  />
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <button
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition hover:bg-accent"
                  >
                    {playing ? (
                      <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1l10 6-10 6z" fill="currentColor" /></svg>
                    )}
                  </button>
                  <div className="font-mono text-lg tabular-nums">
                    {fmt(time)} <span className="text-mute">/ {fmt(end)}</span>
                  </div>
                  <label className="ml-2 flex items-center gap-2 text-sm text-mute">
                    <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="accent-accent" /> Loop
                  </label>
                  <div className="ml-auto flex items-center gap-1.5">
                    {BGS.map((b) => (
                      <button key={b} aria-label={`Background ${b}`} onClick={() => setBg(b)} className={`h-5 w-5 rounded-full border ${bg === b ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : 'border-line'}`} style={{ background: b }} />
                    ))}
                  </div>
                </div>
              </section>

              <aside className="w-72 shrink-0 space-y-5 overflow-y-auto border-l border-line p-4 max-[1000px]:w-60">
                {selected ? (
                  <>
                    <div>
                      <div className={lbl}>Selected clip</div>
                      <div className="font-display text-3xl leading-tight">{assets.find((a) => a.id === selected.assetId)?.name}</div>
                    </div>
                    <div>
                      <div className="flex justify-between">
                        <span className={lbl}>Speed</span>
                        <span className="font-mono text-[10px]">{selected.speed}x · {selected.dur.toFixed(2)}s</span>
                      </div>
                      <input type="range" min={0.25} max={4} step={0.05} value={selected.speed} onChange={(e) => setSpeed(+e.target.value)} className="w-full" />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {SPEEDS.map((s) => (
                          <button key={s} onClick={() => setSpeed(s)} className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${selected.speed === s ? 'border-ink bg-ink text-white' : 'border-line hover:bg-panel2'}`}>{s}x</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className={`${lbl} mb-1.5`}>Motion</div>
                      <div className="grid grid-cols-3 gap-1">
                        {MOTIONS.map((m) => (
                          <button key={m} onClick={() => update(selected.id, { motion: m })} className={`rounded-md border py-1.5 font-mono text-[10px] uppercase tracking-wider ${selected.motion === m ? 'border-accent bg-accent text-white' : 'border-line hover:bg-panel2'}`}>{m}</button>
                        ))}
                      </div>
                    </div>
                    {slider('Scale', selected.scale, 0.2, 3, 0.05, 'scale', `${Math.round(selected.scale * 100)}%`)}
                    {slider('Rotation', selected.rot, -180, 180, 1, 'rot', `${Math.round(selected.rot)}°`)}
                    {slider('Opacity', selected.opacity, 0, 1, 0.01, 'opacity', `${Math.round(selected.opacity * 100)}%`)}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button className={btn} onClick={split} title="Split at playhead (S)">Split</button>
                      <button className={btn} onClick={dup}>Dupe</button>
                      <button className={`${btn} hover:!bg-accent hover:!text-white`} onClick={del}>Delete</button>
                    </div>
                    <button className={`${btn} w-full`} onClick={() => { setDrawId(selected.assetId); setMode('draw') }}>Edit drawing</button>
                  </>
                ) : (
                  <div className="pt-2">
                    <div className="font-display text-4xl italic leading-[1.05]">Select a clip.</div>
                    <p className="mt-3 text-sm leading-relaxed text-mute">
                      Click a drawing in the bin to drop it at the playhead, then click a clip on the timeline or stage to change its speed, motion and look.
                    </p>
                    <ul className="mt-5 space-y-1.5 font-mono text-[11px] text-mute">
                      <li><b className="text-ink">Space</b> play / pause</li>
                      <li><b className="text-ink">S</b> split at playhead</li>
                      <li><b className="text-ink">Del</b> remove clip</li>
                      <li><b className="text-ink">Drag</b> clip edges to trim</li>
                    </ul>
                  </div>
                )}
              </aside>
            </div>

            <div className="flex h-[272px] shrink-0 flex-col border-t border-line">
              <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
                <span className={lbl}>Timeline</span>
                <button className={`${btn} !h-7`} onClick={split} disabled={!selected}>✂ Split</button>
                <div className="ml-auto flex items-center gap-2">
                  <span className={lbl}>Zoom</span>
                  <input type="range" min={40} max={200} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="w-28" />
                </div>
              </div>
              <Timeline clips={clips} assets={assets} time={time} setTime={(t) => { setPlaying(false); setTime(t) }} total={total} pps={zoom} selectedId={sel} select={setSel} update={update} />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
