import { deflateSync } from 'node:zlib'
import type { Framebuffer } from './rasterizer.js'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = (CRC_TABLE[(crc ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(typeData), 0)
  return Buffer.concat([len, typeData, crcBuf])
}

export function encodePNG(fb: Framebuffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(fb.width, 0)
  ihdrData.writeUInt32BE(fb.height, 4)
  ihdrData[8] = 8
  ihdrData[9] = 2
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)

  const stride = fb.width * 3
  const raw = Buffer.alloc((stride + 1) * fb.height)
  for (let y = 0; y < fb.height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    raw.set(fb.data.subarray(y * stride, y * stride + stride), rowStart + 1)
  }
  const idat = chunk('IDAT', deflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}