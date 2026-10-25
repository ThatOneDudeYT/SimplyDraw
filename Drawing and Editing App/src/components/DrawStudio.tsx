import { useEffect, useRef, useState } from 'react'
import { Asset, SRC, blankFrame } from '../lib/model'

const SWATCHES = ['#111111', '#ff4f1f', '#ffb800', '#2bb7a3', '#3a5bff', '#d6409f', '#ffffff', '#8a5a3c']
type Tool = 'brush' | 'marker' | 'eraser'

const lbl = 'font-mono text-[10px] uppercase tracking-[0.12em] text-mute'

export default function DrawStudio({ asset, onChange }: { asset: Asset; onChange: (a: Asset) => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [frame, setFrame] = useState(0)
  const [rev, setRev] = useState(0)
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#111111')
  const [size, setSize] = useState(10)
  const [onion, setOnion] = useState(true)
  const [prev, setPrev] = useState(false)
  const [prevIdx, setPrevIdx] = useState(0)
  const undo = useRef<{ key: string; data: string }[]>([])
  const drawing = useRef<{ x: number; y: number; before: string } | null>(null)
  const assetRef = useRef(asset)
  assetRef.current = asset

  const f = Math.min(frame, asset.frames.length - 1)

  useEffect(() => {
    setFrame(0)
    undo.current = []
    setRev((r) => r + 1)
  }, [asset.id])

  useEffect(() => {
    const c = cv.current!
    const g = c.getContext('2d')!
    g.clearRect(0, 0, SRC, SRC)
    const img = new Image()
    img.onload = () => g.drawImage(img, 0, 0)
    img.src = assetRef.current.frames[f]
  }, [f, rev, asset.id])

  useEffect(() => {
    if (!prev) return
    const id = setInterval(() => setPrevIdx((i) => (i + 1) % assetRef.current.frames.length), 1000 / asset.fps)
    return () => clearInterval(id)
  }, [prev, asset.fps])

  const commit = (data: string) => {
    const a = assetRef.current
    onChange({ ...a, frames: a.frames.map((fr, i) => (i === f ? data : fr)) })
  }

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * SRC, y: ((e.clientY - r.top) / r.height) * SRC }
  }

  const style = (g: CanvasRenderingContext2D, pressure: number) => {
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    g.globalAlpha = tool === 'marker' ? 0.45 : 1
    g.strokeStyle = g.fillStyle = color
    const p = pressure > 0 && pressure < 1 ? 0.4 + pressure : 1
    g.lineWidth = (tool === 'eraser' ? size * 2 : tool === 'marker' ? size * 2.2 : size) * p
  }

  const down = (e: React.PointerEvent) => {
    cv.current!.setPointerCapture(e.pointerId)
    const { x, y } = pos(e)
    const g = cv.current!.getContext('2d')!
    drawing.current = { x, y, before: cv.current!.toDataURL() }
    style(g, e.pressure)
    g.beginPath()
    g.arc(x, y, g.lineWidth / 2, 0, Math.PI * 2)
    g.fill()
  }
  const move = (e: React.PointerEvent) => {
    const d = drawing.current
    if (!d) return
    const { x, y } = pos(e)
    const g = cv.current!.getContext('2d')!
    style(g, e.pressure)
    g.beginPath()
    g.moveTo(d.x, d.y)
    g.lineTo(x, y)
    g.stroke()
    d.x = x
    d.y = y
  }
  const up = () => {
    const d = drawing.current
    if (!d) return
    drawing.current = null
    undo.current.push({ key: `${asset.id}:${f}`, data: d.before })
    const g = cv.current!.getContext('2d')!
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    commit(cv.current!.toDataURL())
  }

  const doUndo = () => {
    const i = undo.current.map((u) => u.key).lastIndexOf(`${asset.id}:${f}`)
    if (i < 0) return
    const [u] = undo.current.splice(i, 1)
    const g = cv.current!.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      g.clearRect(0, 0, SRC, SRC)
      g.drawImage(img, 0, 0)
      commit(u.data)
    }
    img.src = u.data
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        doUndo()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const structural = (frames: string[], idx: number) => {
    undo.current = []
    onChange({ ...asset, frames })
    setFrame(idx)
    setRev((r) => r + 1)
  }
  const addFrame = () => {
    const fr = [...asset.frames]
    fr.splice(f + 1, 0, blankFrame())
    structural(fr, f + 1)
  }
  const dupFrame = () => {
    const fr = [...asset.frames]
    fr.splice(f + 1, 0, asset.frames[f])
    structural(fr, f + 1)
  }
  const delFrame = () => {
    if (asset.frames.length < 2) return
    structural(asset.frames.filter((_, i) => i !== f), Math.max(0, f - 1))
  }
  const clear = () => {
    undo.current.push({ key: `${asset.id}:${f}`, data: asset.frames[f] })
    const g = cv.current!.getContext('2d')!
    g.clearRect(0, 0, SRC, SRC)
    commit(cv.current!.toDataURL())
  }

  const toolBtn = (t: Tool, label: string) => (
    <button
      key={t}
      onClick={() => setTool(t)}
      className={`h-10 w-full rounded-md border font-mono text-[10px] uppercase tracking-wider transition ${tool === t ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink hover:bg-panel2'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="grid h-full min-h-0 grid-cols-[84px_1fr_260px] grid-rows-[1fr_auto] max-[1000px]:grid-cols-[84px_1fr]">
      <div className="flex flex-col gap-2 border-r border-line p-3">
        {toolBtn('brush', 'Pen')}
        {toolBtn('marker', 'Marker')}
        {toolBtn('eraser', 'Erase')}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {SWATCHES.map((s) => (
            <button
              key={s}
              aria-label={s}
              onClick={() => {
                setColor(s)
                if (tool === 'eraser') setTool('brush')
              }}
              className={`h-6 rounded-full border ${color === s ? 'ring-2 ring-accent ring-offset-1' : 'border-line'}`}
              style={{ background: s }}
            />
          ))}
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 w-full cursor-pointer rounded border border-line bg-transparent"
        />
        <div className="mt-2">
          <div className={lbl}>Size {size}</div>
          <input type="range" min={2} max={60} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full" />
        </div>
        <button onClick={doUndo} className="mt-2 h-9 rounded-md border border-line font-mono text-[10px] uppercase tracking-wider hover:bg-panel2">
          Undo
        </button>
        <button onClick={clear} className="h-9 rounded-md border border-line font-mono text-[10px] uppercase tracking-wider hover:bg-panel2">
          Clear
        </button>
      </div>

      <div className="flex min-h-0 items-center justify-center bg-panel p-6">
        <div className="checker relative aspect-square h-full max-h-full max-w-full overflow-hidden rounded-lg border border-line shadow-[0_1px_0_rgba(0,0,0,0.04),0_20px_50px_-30px_rgba(0,0,0,0.35)]">
          {onion && f > 0 && (
            <img src={asset.frames[f - 1]} alt="" className="pointer-events-none absolute inset-0 h-full w-full opacity-25" />
          )}
          <canvas
            ref={cv}
            width={SRC}
            height={SRC}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 border-l border-line p-4 max-[1000px]:hidden">
        <div>
          <div className={lbl}>Asset name</div>
          <input
            value={asset.name}
            onChange={(e) => onChange({ ...asset, name: e.target.value })}
            className="mt-1 w-full border-b border-line bg-transparent pb-1 font-display text-3xl outline-none focus:border-ink"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <div className={lbl}>Flipbook preview</div>
            <button onClick={() => setPrev((p) => !p)} className="font-mono text-[10px] uppercase tracking-wider text-accent">
              {prev ? 'Stop' : 'Play'}
            </button>
          </div>
          <div className="checker mt-2 aspect-square overflow-hidden rounded-lg border border-line">
            <img src={asset.frames[prev ? prevIdx % asset.frames.length : f]} alt="preview" className="h-full w-full" />
          </div>
        </div>
        <div>
          <div className={lbl}>Frame rate · {asset.fps} fps</div>
          <input type="range" min={1} max={24} value={asset.fps} onChange={(e) => onChange({ ...asset, fps: +e.target.value })} className="w-full" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} className="accent-accent" />
          Onion skin
        </label>
        <p className="mt-auto text-xs leading-relaxed text-mute">
          Add frames to animate. Switch to Edit to drop this asset on the timeline and change its speed.
        </p>
      </div>

      <div className="col-span-full flex items-center gap-3 overflow-x-auto border-t border-line bg-paper px-4 py-3">
        <div className="flex gap-2">
          {asset.frames.map((fr, i) => (
            <button
              key={i}
              onClick={() => {
                setFrame(i)
              }}
              className={`checker relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition ${i === f ? 'border-accent' : 'border-line hover:border-mute'}`}
            >
              <img src={fr} alt={`frame ${i + 1}`} className="h-full w-full" />
              <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-mute">{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[
            ['+ Frame', addFrame],
            ['Duplicate', dupFrame],
            ['Delete', delFrame],
          ].map(([l, fn]) => (
            <button
              key={l as string}
              onClick={fn as () => void}
              className="h-9 shrink-0 rounded-md border border-line px-3 font-mono text-[10px] uppercase tracking-wider hover:bg-panel2"
            >
              {l as string}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
