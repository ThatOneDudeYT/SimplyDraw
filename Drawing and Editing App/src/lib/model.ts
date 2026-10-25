export type Asset = { id: string; name: string; frames: string[]; fps: number }
export type Motion = 'none' | 'bounce' | 'spin' | 'float' | 'pulse' | 'fadein'
export type Clip = {
  id: string
  assetId: string
  track: number
  start: number
  dur: number
  offset: number
  speed: number
  x: number
  y: number
  scale: number
  rot: number
  opacity: number
  motion: Motion
}

export const W = 1280
export const H = 720
export const BASE = 380
export const SRC = 512
export const TRACKS = 4

export const uid = () => Math.random().toString(36).slice(2, 9)

const imgCache = new Map<string, HTMLImageElement>()
export function getImg(src: string, onLoad?: () => void) {
  let i = imgCache.get(src)
  if (!i) {
    i = new Image()
    i.onload = () => onLoad?.()
    i.src = src
    imgCache.set(src, i)
  }
  return i
}

export function blankFrame() {
  const c = document.createElement('canvas')
  c.width = c.height = SRC
  return c.toDataURL()
}

export const clipEnd = (c: Clip) => c.start + c.dur

export function motionAt(c: Clip, t: number) {
  const p = Math.max(0, (t - c.start) * c.speed + c.offset)
  let dx = 0,
    dy = 0,
    rot = 0,
    scale = 1,
    opacity = 1
  switch (c.motion) {
    case 'bounce':
      dy = -Math.abs(Math.sin(p * Math.PI * 1.4)) * 0.14 * H
      break
    case 'spin':
      rot = p * 140
      break
    case 'float':
      dy = Math.sin(p * 2) * 0.035 * H
      dx = Math.cos(p * 1.3) * 0.02 * W
      break
    case 'pulse':
      scale = 1 + Math.sin(p * 6) * 0.1
      break
    case 'fadein':
      opacity = Math.min(1, p / 0.7)
      break
  }
  return { dx, dy, rot, scale, opacity }
}

export function frameAt(a: Asset, c: Clip, t: number) {
  const lt = Math.max(0, c.offset + (t - c.start) * c.speed)
  return a.frames[Math.floor(lt * a.fps) % a.frames.length]
}

export function clipTransform(c: Clip, t: number) {
  const m = motionAt(c, t)
  return {
    cx: c.x * W + m.dx,
    cy: c.y * H + m.dy,
    rot: c.rot + m.rot,
    size: BASE * c.scale * m.scale,
    opacity: c.opacity * m.opacity,
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  o: {
    assets: Asset[]
    clips: Clip[]
    t: number
    bg: string
    selectedId?: string | null
    onLoad?: () => void
  },
) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = o.bg
  ctx.fillRect(0, 0, W, H)
  const active = o.clips
    .filter((c) => o.t >= c.start && o.t < clipEnd(c))
    .sort((a, b) => a.track - b.track)
  for (const c of active) {
    const a = o.assets.find((x) => x.id === c.assetId)
    if (!a) continue
    const img = getImg(frameAt(a, c, o.t), o.onLoad)
    const tr = clipTransform(c, o.t)
    ctx.save()
    ctx.translate(tr.cx, tr.cy)
    ctx.rotate((tr.rot * Math.PI) / 180)
    ctx.globalAlpha = tr.opacity
    if (img.complete && img.naturalWidth) ctx.drawImage(img, -tr.size / 2, -tr.size / 2, tr.size, tr.size)
    ctx.restore()
    if (o.selectedId === c.id) {
      ctx.save()
      ctx.translate(tr.cx, tr.cy)
      ctx.rotate((tr.rot * Math.PI) / 180)
      ctx.strokeStyle = '#ff4f1f'
      ctx.lineWidth = 3
      ctx.setLineDash([12, 8])
      ctx.strokeRect(-tr.size / 2, -tr.size / 2, tr.size, tr.size)
      ctx.restore()
    }
  }
}

export function hitTest(clips: Clip[], t: number, px: number, py: number) {
  const active = clips
    .filter((c) => t >= c.start && t < clipEnd(c))
    .sort((a, b) => b.track - a.track)
  for (const c of active) {
    const tr = clipTransform(c, t)
    const r = (-tr.rot * Math.PI) / 180
    const dx = px - tr.cx,
      dy = py - tr.cy
    const lx = dx * Math.cos(r) - dy * Math.sin(r)
    const ly = dx * Math.sin(r) + dy * Math.cos(r)
    if (Math.abs(lx) <= tr.size / 2 && Math.abs(ly) <= tr.size / 2) return c
  }
  return null
}

function mk(draw: (g: CanvasRenderingContext2D, i: number) => void, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const c = document.createElement('canvas')
    c.width = c.height = SRC
    const g = c.getContext('2d')!
    g.lineJoin = 'round'
    g.lineCap = 'round'
    draw(g, i)
    return c.toDataURL()
  })
}

export function seedAssets(): Asset[] {
  const spark = mk((g, i) => {
    const r = 200 + (i % 2 ? -30 : 10)
    g.translate(256, 256)
    g.rotate((i * Math.PI) / 8)
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? r * 0.45 : r
      const a = (k * Math.PI) / 5 - Math.PI / 2
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
    }
    g.closePath()
    g.fillStyle = '#ff4f1f'
    g.fill()
    g.lineWidth = 14
    g.strokeStyle = '#111'
    g.stroke()
  }, 4)
  const blob = mk((g, i) => {
    const sq = [1, 0.9, 1.08, 0.95][i]
    g.translate(256, 470)
    g.scale(1 / sq, sq)
    g.beginPath()
    g.ellipse(0, -170, 170, 170, 0, 0, Math.PI * 2)
    g.fillStyle = '#2bb7a3'
    g.fill()
    g.lineWidth = 14
    g.strokeStyle = '#111'
    g.stroke()
    g.fillStyle = '#fff'
    for (const ex of [-55, 55]) {
      g.beginPath()
      g.arc(ex, -200, 36, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#111'
      g.beginPath()
      g.arc(ex + (i % 2 ? 8 : -8), -196, 14, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
    }
    g.beginPath()
    g.arc(0, -130, 40, 0.1 * Math.PI, 0.9 * Math.PI)
    g.stroke()
  }, 4)
  return [
    { id: 'seed-spark', name: 'Spark', frames: spark, fps: 8 },
    { id: 'seed-blob', name: 'Blobby', frames: blob, fps: 6 },
  ]
}

export function seedClips(): Clip[] {
  const base = { offset: 0, speed: 1, scale: 1, rot: 0, opacity: 1 }
  return [
    { ...base, id: uid(), assetId: 'seed-blob', track: 0, start: 0, dur: 5, x: 0.3, y: 0.58, motion: 'bounce' },
    { ...base, id: uid(), assetId: 'seed-spark', track: 1, start: 1, dur: 4.5, x: 0.68, y: 0.4, scale: 0.8, motion: 'spin' },
  ]
}
