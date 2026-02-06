// Minimal MessageBuilder - implements essential protocol only
// Based on the original message.js but stripped down to core functionality

import { EventBus } from '@zos/utils'

const MESSAGE_SIZE = 3600
const MESSAGE_HEADER = 16
const MESSAGE_PAYLOAD = MESSAGE_SIZE - MESSAGE_HEADER
const HM_MESSAGE_PROTO_HEADER = 66
const HM_MESSAGE_PROTO_PAYLOAD = MESSAGE_PAYLOAD - HM_MESSAGE_PROTO_HEADER

const MessageFlag = { App: 0x1 }
const MessageType = { Shake: 0x1, Close: 0x2, Data: 0x4 }
const MessageVersion = { Version1: 0x1 }
const MessagePayloadType = { Request: 0x1, Response: 0x2 }
const MessagePayloadOpCode = { Continued: 0x0, Finished: 0x1 }

let traceId = 10000
let spanId = 1000

function genTraceId() { return traceId++ }
function genSpanId() { return spanId++ }
function getTimestamp(t = Date.now()) { return t % 10000000 }

// Helper functions
function str2buf(str) {
  return Buffer.from(str, 'utf-8')
}

function buf2str(buf) {
  return buf.toString('utf-8')
}

function json2buf(json) {
  return str2buf(JSON.stringify(json))
}

function buf2json(buf) {
  return JSON.parse(buf2str(buf))
}

function bin2hex(bin) {
  return Buffer.from(bin).toString('hex')
}

export class MessageBuilder extends EventBus {
  constructor({ appId = 0, appDevicePort = 20, appSidePort = 0, ble = undefined } = {}) {
    super()
    this.isDevice = typeof __ZEPPOS__ !== 'undefined'
    this.appId = appId
    this.appDevicePort = appDevicePort
    this.appSidePort = appSidePort
    this.ble = ble
    this.chunkSize = MESSAGE_PAYLOAD
    this.sessions = new Map()
  }

  buf2Json(buf) {
    return buf2json(buf)
  }

  json2Buf(json) {
    return json2buf(json)
  }

  connect(cb) {
    this.on('message', (message) => {
      this.onMessage(message)
    })

    this.ble && this.ble.createConnect((index, data, size) => {
      this.onFragmentData(data)
    })

    this.sendShake()
    cb && cb(this)
  }

  disConnect(cb) {
    this.sendClose()
    this.off('message')
    this.ble && this.ble.disConnect()
    cb && cb(this)
  }

  buildBin(data) {
    const size = MESSAGE_HEADER + data.payload.byteLength
    let buf = Buffer.alloc(size)
    let offset = 0

    buf.writeUInt8(data.flag, offset); offset += 1
    buf.writeUInt8(data.version, offset); offset += 1
    buf.writeUInt16LE(data.type, offset); offset += 2
    buf.writeUInt16LE(data.port1, offset); offset += 2
    buf.writeUInt16LE(data.port2, offset); offset += 2
    buf.writeUInt32LE(data.appId, offset); offset += 4
    buf.writeUInt32LE(data.extra, offset); offset += 4
    buf.fill(data.payload, offset, data.payload.byteLength + offset)

    return buf
  }

  buildShake() {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Shake,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      payload: Buffer.from([this.appId])
    })
  }

  sendShake() {
    if (this.appSidePort === 0) {
      const shake = this.buildShake()
      this.sendBin(shake)
    }
  }

  buildClose() {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Close,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      payload: Buffer.from([this.appId])
    })
  }

  sendClose() {
    if (this.appSidePort !== 0) {
      const close = this.buildClose()
      this.sendBin(close)
    }
  }

  sendBin(buf) {
    this.ble.send(buf.buffer, buf.byteLength)
  }

  buildData(payload) {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Data,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      payload
    })
  }

  buildPayload(data) {
    const size = HM_MESSAGE_PROTO_HEADER + data.payload.byteLength
    let buf = Buffer.alloc(size)
    let offset = 0

    buf.writeUInt32LE(data.traceId, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4 // parentId
    buf.writeUInt32LE(data.spanId, offset); offset += 4
    buf.writeUInt32LE(data.seqId, offset); offset += 4
    buf.writeUInt32LE(data.totalLength, offset); offset += 4
    buf.writeUInt32LE(data.payload.byteLength, offset); offset += 4
    buf.writeUInt8(data.type, offset); offset += 1
    buf.writeUInt8(data.opCode, offset); offset += 1
    buf.writeUInt32LE(getTimestamp(), offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt8(0, offset); offset += 1 // contentType
    buf.writeUInt8(0, offset); offset += 1 // dataType
    buf.writeUInt16LE(0, offset); offset += 2
    buf.writeUInt32LE(0, offset); offset += 4
    buf.writeUInt32LE(0, offset); offset += 4
    buf.fill(data.payload, offset, data.payload.byteLength + offset)

    return buf
  }

  sendHmProtocol({ requestId, dataBin, type }) {
    const hmDataSize = HM_MESSAGE_PROTO_PAYLOAD
    const userDataLength = dataBin.byteLength
    const traceIdVal = requestId || genTraceId()
    const spanIdVal = genSpanId()
    let seqId = 1
    let offset = 0

    const count = Math.ceil(userDataLength / hmDataSize)

    for (let i = 1; i <= count; i++) {
      const isLast = i === count
      const chunkSize = isLast ? userDataLength - offset : hmDataSize
      const chunkBuf = Buffer.alloc(chunkSize)
      
      dataBin.copy(chunkBuf, 0, offset, offset + chunkSize)
      offset += chunkSize

      const payloadBin = this.buildPayload({
        traceId: traceIdVal,
        spanId: spanIdVal,
        seqId: seqId++,
        totalLength: userDataLength,
        type,
        opCode: isLast ? MessagePayloadOpCode.Finished : MessagePayloadOpCode.Continued,
        payload: chunkBuf
      })

      const data = this.buildData(payloadBin)
      this.sendBin(data)
    }
  }

  request({ method, params }) {
    return new Promise((resolve, reject) => {
      const requestId = genTraceId()
      
      const json = { method, params }
      const packageBin = json2buf(json)
      
      this.sessions.set(requestId, { resolve, reject })
      
      setTimeout(() => {
        if (this.sessions.has(requestId)) {
          this.sessions.delete(requestId)
          reject('Timeout')
        }
      }, 5000)

      this.sendHmProtocol({
        requestId,
        dataBin: packageBin,
        type: MessagePayloadType.Request
      })
    })
  }

  readBin(arrayBuf) {
    const buf = Buffer.from(arrayBuf)
    let offset = 0

    const flag = buf.readUInt8(offset); offset += 1
    const version = buf.readUInt8(offset); offset += 1
    const type = buf.readUInt16LE(offset); offset += 2
    const port1 = buf.readUInt16LE(offset); offset += 2
    const port2 = buf.readUInt16LE(offset); offset += 2
    const appId = buf.readUInt32LE(offset); offset += 4
    const extra = buf.readUInt32LE(offset); offset += 4
    const payload = buf.subarray(offset)

    return { flag, version, type, port1, port2, appId, extra, payload }
  }

  readPayload(arrayBuf) {
    const buf = Buffer.from(arrayBuf)
    let offset = 0

    const traceId = buf.readUInt32LE(offset); offset += 4
    offset += 4 // parentId
    offset += 4 // spanId
    offset += 4 // seqId
    const totalLength = buf.readUInt32LE(offset); offset += 4
    const payloadLength = buf.readUInt32LE(offset); offset += 4
    const payloadType = buf.readUInt8(offset); offset += 1
    const opCode = buf.readUInt8(offset); offset += 1
    offset += 28 // timestamps
    offset += 2 // contentType + dataType + padding
    offset += 8 // extra1 + extra2
    const payload = buf.subarray(offset)

    return { traceId, totalLength, payloadLength, payloadType, opCode, payload }
  }

  onFragmentData(bin) {
    const data = this.readBin(bin)

    if (data.flag === MessageFlag.App && data.type === MessageType.Shake) {
      this.appSidePort = data.port2
    } else if (data.flag === MessageFlag.App && data.type === MessageType.Data && data.port2 === this.appSidePort) {
      this.emit('message', data.payload)
    }
  }

  onMessage(message) {
    const payload = this.readPayload(message)
    
    if (payload.opCode === MessagePayloadOpCode.Finished) {
      // Simple case - single message
      if (payload.payloadType === MessagePayloadType.Response) {
        const session = this.sessions.get(payload.traceId)
        if (session) {
          try {
            const data = buf2json(payload.payload)
            session.resolve(data)
          } catch (e) {
            session.reject(e)
          }
          this.sessions.delete(payload.traceId)
        }
      }
    }
  }
}
