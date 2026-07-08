import {
  createFramebuffer, drawLineBresenham, drawCircleMidpoint, fillRect,
  windowToViewport, rotatePoint2D, drawText, measureText, drawStar,
} from './rasterizer.js'
import type { RGB, Rect } from './rasterizer.js'
import { encodePNG } from './png-encoder.js'

const NAVY: RGB = [11, 31, 61]
const ROYAL: RGB = [30, 79, 190]
const CYAN: RGB = [0, 144, 176]
const GOLD: RGB = [230, 165, 25]
const GRID: RGB = [222, 227, 235]
const GRAY: RGB = [150, 158, 171]
const WHITE: RGB = [255, 255, 255]

export interface ReviewLike { rating: number }

function centerX(text: string, scale: number, canvasWidth: number): number {
  return (canvasWidth - measureText(text, scale)) / 2
}

export function renderReviewDistributionChart(reviews: ReviewLike[]): Buffer {
  const W = 480
  const H = 435
  const fb = createFramebuffer(W, H, WHITE)

  const title = 'DISTRIBUSI RATING ULASAN'
  drawText(fb, title, centerX(title, 2, W), 14, 2, NAVY)

  const counts = [0, 0, 0, 0, 0, 0]
  for (const r of reviews) {
    const bucket = Math.min(5, Math.max(1, Math.round(r.rating)))
    counts[bucket] = (counts[bucket] ?? 0) + 1
  }
  const maxCount = Math.max(1, ...counts.slice(1))

  const win: Rect = { xmin: 0.5, ymin: 0, xmax: 5.5, ymax: maxCount * 1.25 }
  const vp: Rect = { xmin: 60, ymin: 48, xmax: 440, ymax: 225 }

  const origin = windowToViewport(win.xmin, 0, win, vp)
  const xEnd = windowToViewport(win.xmax, 0, win, vp)
  const yEnd = windowToViewport(win.xmin, win.ymax, win, vp)
  drawLineBresenham(fb, origin.x, origin.y, xEnd.x, xEnd.y, NAVY)
  drawLineBresenham(fb, origin.x, origin.y, yEnd.x, yEnd.y, NAVY)

  for (let g = 1; g <= 4; g++) {
    const gy = windowToViewport(win.xmin, (win.ymax * g) / 4, win, vp)
    const gx = windowToViewport(win.xmax, (win.ymax * g) / 4, win, vp)
    drawLineBresenham(fb, gy.x, gy.y, gx.x, gx.y, GRID)
  }

  drawText(fb, 'JUMLAH ULASAN', vp.xmin - 4, vp.ymin - 18, 1, GRAY)

  for (let rating = 1; rating <= 5; rating++) {
    const count = counts[rating] ?? 0
    const topLeft = windowToViewport(rating - 0.32, count, win, vp)
    const bottomRight = windowToViewport(rating + 0.32, 0, win, vp)
    fillRect(fb, topLeft.x, topLeft.y, bottomRight.x, bottomRight.y, ROYAL)

    const top = windowToViewport(rating, count, win, vp)
    drawCircleMidpoint(fb, top.x, top.y - 6, 4, CYAN)
    const countLabel = String(count)
    drawText(fb, countLabel, top.x - measureText(countLabel, 1.5) / 2, top.y - 24, 1.5, NAVY)

    const axisPos = windowToViewport(rating, 0, win, vp)
    drawStar(fb, axisPos.x, axisPos.y + 16, 7, 3, GOLD)
    const ratingLabel = String(rating)
    drawText(fb, ratingLabel, axisPos.x - measureText(ratingLabel, 1.5) / 2, axisPos.y + 27, 1.5, NAVY)
  }

  const gaugeTitle = 'RATA-RATA RATING'
  drawText(fb, gaugeTitle, centerX(gaugeTitle, 2, W), 282, 2, NAVY)

  const total = reviews.length
  const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0
  const gcx = W / 2
  const gcy = 372
  const radius = 60

  const STEPS = 40
  let prev = rotatePoint2D(radius, 0, 0, 0, 0)
  for (let i = 1; i <= STEPS; i++) {
    const a = (Math.PI * i) / STEPS
    const p = rotatePoint2D(radius, 0, -a, 0, 0)
    drawLineBresenham(fb, gcx + prev.x, gcy + prev.y, gcx + p.x, gcy + p.y, GRID)
    prev = p
  }

  const needleAngle = Math.PI * (1 - avg / 5)
  const needleTip = rotatePoint2D(radius - 14, 0, -needleAngle, 0, 0)
  drawLineBresenham(fb, gcx, gcy, gcx + needleTip.x, gcy + needleTip.y, ROYAL)
  drawCircleMidpoint(fb, gcx, gcy, 5, NAVY)

  const avgLabel = `${avg.toFixed(1)}/5`
  drawText(fb, avgLabel, centerX(avgLabel, 2, W), gcy + 22, 2, NAVY)

  return encodePNG(fb)
}