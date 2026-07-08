export interface Framebuffer {
  width: number
  height: number
  data: Uint8Array
}

export type RGB = [number, number, number]

export function createFramebuffer(width: number, height: number, bg: RGB): Framebuffer {
  const data = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = bg[0]
    data[i * 3 + 1] = bg[1]
    data[i * 3 + 2] = bg[2]
  }
  return { width, height, data }
}

export function setPixel(fb: Framebuffer, x: number, y: number, color: RGB) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) return
  const i = (y * fb.width + x) * 3
  fb.data[i] = color[0]
  fb.data[i + 1] = color[1]
  fb.data[i + 2] = color[2]
}

export function drawLineBresenham(fb: Framebuffer, x0: number, y0: number, x1: number, y1: number, color: RGB) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  while (true) {
    setPixel(fb, x0, y0, color)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

export function drawCircleMidpoint(fb: Framebuffer, cx: number, cy: number, r: number, color: RGB) {
  cx = Math.round(cx)
  cy = Math.round(cy)
  r = Math.round(r)
  let x = r
  let y = 0
  let p = 1 - r
  const plot = (x: number, y: number) => {
    setPixel(fb, cx + x, cy + y, color)
    setPixel(fb, cx - x, cy + y, color)
    setPixel(fb, cx + x, cy - y, color)
    setPixel(fb, cx - x, cy - y, color)
    setPixel(fb, cx + y, cy + x, color)
    setPixel(fb, cx - y, cy + x, color)
    setPixel(fb, cx + y, cy - x, color)
    setPixel(fb, cx - y, cy - x, color)
  }
  plot(x, y)
  while (x > y) {
    y++
    if (p <= 0) { 
      p += 2 * y + 1 
    } else { 
      x--
      p += 2 * y - 2 * x + 1 
    }
    plot(x, y)
  }
}

export function fillRect(fb: Framebuffer, x0: number, y0: number, x1: number, y1: number, color: RGB) {
  const xs = Math.round(Math.min(x0, x1))
  const xe = Math.round(Math.max(x0, x1))
  const ys = Math.round(Math.min(y0, y1))
  const ye = Math.round(Math.max(y0, y1))
  for (let y = ys; y <= ye; y++) {
    drawLineBresenham(fb, xs, y, xe, y, color)
  }
}

export interface Rect { 
  xmin: number
  ymin: number
  xmax: number
  ymax: number 
}

export function windowToViewport(xw: number, yw: number, win: Rect, vp: Rect) {
  const sx = (vp.xmax - vp.xmin) / (win.xmax - win.xmin)
  const sy = (vp.ymax - vp.ymin) / (win.ymax - win.ymin)
  const xv = vp.xmin + (xw - win.xmin) * sx
  const yv = vp.ymax - (yw - win.ymin) * sy
  return { x: xv, y: yv }
}

export function rotatePoint2D(x: number, y: number, angleRad: number, pivotX = 0, pivotY = 0) {
  const dx = x - pivotX
  const dy = y - pivotY
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: dx * cos - dy * sin + pivotX,
    y: dx * sin + dy * cos + pivotY,
  }
}

const FONT: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
}

export function drawText(fb: Framebuffer, text: string, x: number, y: number, scale: number, color: RGB) {
  let cx = x
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch]
    if (glyph) {
      for (let row = 0; row < 7; row++) {
        const rowBits = glyph[row]
        if (rowBits) {
          for (let col = 0; col < 5; col++) {
            if (rowBits[col] === '1') {
              fillRect(fb, cx + col * scale, y + row * scale, cx + col * scale + scale - 1, y + row * scale + scale - 1, color)
            }
          }
        }
      }
    }
    cx += 6 * scale
  }
}

export function measureText(text: string, scale: number): number {
  return text.length * 6 * scale
}

export function drawStar(fb: Framebuffer, cx: number, cy: number, outerR: number, innerR: number, color: RGB) {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outerR : innerR
    const p = rotatePoint2D(r, 0, angle, 0, 0)
    pts.push({ x: cx + p.x, y: cy + p.y })
  }
  
  const ys = Math.floor(Math.min(...pts.map((p) => p.y)))
  const ye = Math.ceil(Math.max(...pts.map((p) => p.y)))
  
  for (let y = ys; y <= ye; y++) {
    const xs: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!
      const b = pts[(i + 1) % pts.length]!
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      drawLineBresenham(fb, xs[i]!, y, xs[i + 1]!, y, color)
    }
  }
}