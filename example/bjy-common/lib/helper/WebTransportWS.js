/**
 * 包装 WebTransport 成 html5 的 ws
 */
import * as is from '../util/is.js';
import NetString from './NetString.js';
import * as logger from '../util/logger.js';
import execute from '../function/execute.js';
import nextTick from '../function/nextTick.js';
import * as array from '../util/array.js';
import * as object from '../util/object.js';
import getTimestamp from '../function/getTimestamp.js';
import * as base64 from '../util/base64.js';
import Timer from './Timer.js';
import Avrage from './Avrage.js';
import restrain from '../function/restrain.js';
import isDef from '../function/isDef.js';
const defaultOptions = {
    mode: 'text',
    enableCommand: false,
    binaryCommand: 19,
    pingCommand: 1,
    serverPingCommand: 2,
    useDatagrams: false,
    streamCount: 1,
    textCommandStart: 20,
    textCommandEnd: Math.pow(2, 31) - 1,
    commandTimeout: 30 * 1000,
    bufferSize: 1 * 1024 * 1024,
    autoStream: false,
    enablePing: false,
    pingInterval: 5000
};
export default class WebTransportWS {
    constructor(url, options = {}) {
        this.url = url;
        this.options = object.extend({}, defaultOptions, options);
        if (options.textDecoder) {
            this.textDecoder = options.textDecoder;
        }
        else if (is.func(TextDecoder)) {
            this.textDecoder = new TextDecoder();
        }
        else if (this.options.mode === 'text' && this.options.mode === 'text') {
            logger.warn('has not textDecoder to use, support binary only');
        }
        if (options.textEncoder) {
            this.textEncoder = options.textEncoder;
        }
        else if (is.func(TextEncoder) && this.options.mode === 'text') {
            this.textEncoder = new TextEncoder();
        }
        else if (this.options.mode === 'text') {
            logger.warn('has not textEncoder to use, support binary only');
        }
        this.textCommandPointer = this.options.textCommandStart;
        this.commandMap = new Map();
        this.pingStartTimestamp = new Map();
        this.commandQueue = [];
        this.streams = [];
        this.readers = [];
        this.writers = [];
        this.netStrings = [];
        this.currentWriteStreams = 1;
        this.rtt = new Avrage(5);
        if (this.options.mode === 'stream') {
            this.options.streamCount = 1;
        }
        if (this.options.streamCount > 1) {
            this.options.enableCommand = true;
        }
        if (this.options.streamCount <= 1) {
            this.options.autoStream = false;
        }
        if (this.options.enablePing) {
            this.pingTimer = new Timer(() => {
                this.ping();
            }, 1000, this.options.pingInterval);
        }
        this.connect();
    }
    async read(reader, index) {
        if (this.options.mode === 'text') {
            this.netStrings[index] = new NetString({
                bufferSize: this.options.bufferSize,
                onDecodeText: this.onDecodeMessage.bind(this),
                enableCommand: this.options.enableCommand,
                index
            });
        }
        while (true) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                if (this.options.mode === 'text') {
                    this.netStrings[index].decode(value);
                }
                else {
                    if (this.onmessage) {
                        execute(this.onmessage, this, [{
                                data: value,
                                binary: true
                            }]);
                    }
                }
            }
            catch (error) {
                logger.error(`read data error, ${error}`);
                // 出现解析失败，后面的数据也会解析失败，直接结束
                break;
            }
        }
        if (this.onclose) {
            execute(this.onclose, this, [new Error('readableStream closed')]);
        }
    }
    handleRead() {
        array.each(this.readers, (reader, index) => {
            this.read(reader, index);
        });
    }
    async connect() {
        const opts = {};
        if (is.boolean(this.options.allowPooling)) {
            opts.allowPooling = this.options.allowPooling;
        }
        if (is.array(this.options.serverCertificateHashes)) {
            opts.serverCertificateHashes = [];
            array.each(this.options.serverCertificateHashes, (item) => {
                if (is.string(item.value)) {
                    opts.serverCertificateHashes.push({
                        algorithm: item.algorithm,
                        value: base64.base642Uint8Array(item.value)
                    });
                }
                else {
                    opts.serverCertificateHashes.push({
                        algorithm: item.algorithm,
                        value: item.value
                    });
                }
            });
        }
        this.transport = new WebTransport(this.url.replace(/^webtransport:/, 'https:'), opts);
        this.transport.closed.then(() => {
            logger.info(`WebTransportWS closed gracefully, url: ${this.url}`);
            if (this.onclose) {
                execute(this.onclose, this, [{}]);
            }
        })
            .catch((error) => {
            logger.error(`WebTransportWS closed because of error: ${error}, url: ${this.url}`);
            if (this.onclose) {
                execute(this.onclose, this, [error]);
            }
        });
        await this.transport.ready;
        if (this.options.useDatagrams) {
            this.readers.push(this.transport.datagrams.readable.getReader());
            this.writers.push(this.transport.datagrams.writable.getWriter());
        }
        else {
            for (let i = 0; i < this.options.streamCount; i++) {
                const stream = await this.transport.createBidirectionalStream();
                const reader = stream.readable.getReader();
                const writer = stream.writable.getWriter();
                this.streams.push(stream);
                this.readers.push(reader);
                this.writers.push(writer);
            }
        }
        await Promise.all(this.writers.map(writer => {
            return writer.ready;
        }));
        nextTick(() => {
            if (this.onopen) {
                execute(this.onopen, this, [{}]);
            }
            if (this.pingTimer) {
                this.pingTimer.start();
            }
        });
        this.handleRead();
    }
    getTextCommand() {
        if (!this.options.enableCommand) {
            return -1;
        }
        else {
            const command = this.textCommandPointer++;
            if (this.textCommandPointer > this.options.textCommandEnd) {
                this.textCommandPointer = this.options.textCommandStart;
            }
            return command;
        }
    }
    ping() {
        if (this.writers.length) {
            const now = getTimestamp();
            const buffer = new Float64Array(1);
            buffer[0] = now;
            this.pingStartTimestamp.set(now, setTimeout(() => {
                this.pingStartTimestamp.delete(now);
                const rtt = getTimestamp() - now;
                this.rtt.push(rtt);
                if (is.func(this.options.onPing)) {
                    this.options.onPing(this, rtt);
                }
            }, 5 * 1000));
            this.writers[0].write(NetString.encode(new Uint8Array(buffer.buffer), this.options.pingCommand));
        }
    }
    onDecodeMessage(instance, payload) {
        if (payload.cmd === this.options.pingCommand && this.options.enablePing) {
            const buffer = new Float64Array(payload.payload.buffer);
            // 客户端的 ping 消息返回
            if (this.pingStartTimestamp.has(buffer[0])) {
                clearTimeout(this.pingStartTimestamp.get(buffer[0]));
                const rtt = getTimestamp() - buffer[0];
                this.rtt.push(rtt);
                this.pingStartTimestamp.delete(buffer[0]);
                if (is.func(this.options.onPing)) {
                    this.options.onPing(this, rtt);
                }
            }
        }
        else if (payload.cmd === this.options.serverPingCommand && this.options.enablePing) {
            // 服务器的 ping 消息直接原样返回
            if (this.writers.length && this.netStrings.length) {
                this.writers[instance.options.index].write(payload.serialized);
            }
        }
        else if (payload.cmd >= this.options.textCommandStart && payload.cmd <= this.options.textCommandEnd
            || payload.cmd === this.options.binaryCommand) {
            if (this.options.streamCount > 1) {
                if (this.commandMap.get(payload.cmd)) {
                    // 已经收到过
                    return;
                }
                if (this.onmessage) {
                    execute(this.onmessage, this, [{
                            data: (payload.cmd === this.options.binaryCommand || !this.textDecoder)
                                ? payload.payload
                                : this.textDecoder.decode(payload.payload),
                            binary: payload.cmd === this.options.binaryCommand || !this.textDecoder
                        }]);
                }
                this.commandMap.set(payload.cmd, true);
                this.commandQueue.push({
                    cmd: payload.cmd,
                    timestamp: getTimestamp()
                });
                while (this.commandQueue.length) {
                    if (getTimestamp() - this.commandQueue[0].timestamp > this.options.commandTimeout) {
                        this.commandMap.delete(this.commandQueue[0].cmd);
                        this.commandQueue.shift();
                    }
                    else {
                        break;
                    }
                }
            }
            else {
                if (this.onmessage) {
                    execute(this.onmessage, this, [{
                            data: (payload.cmd === this.options.binaryCommand || !this.textDecoder)
                                ? payload.payload
                                : this.textDecoder.decode(payload.payload),
                            binary: payload.cmd === this.options.binaryCommand || !this.textDecoder
                        }]);
                }
            }
        }
        else if (!isDef(payload.cmd)) {
            if (this.onmessage) {
                execute(this.onmessage, this, [{
                        data: (payload.cmd === this.options.binaryCommand || !this.textDecoder)
                            ? payload.payload
                            : this.textDecoder.decode(payload.payload),
                        binary: payload.cmd === this.options.binaryCommand || !this.textDecoder
                    }]);
            }
        }
    }
    send(data) {
        if (this.options.mode === 'stream') {
            logger.error(`stream mode not support call send method`);
            return;
        }
        const message = is.string(data) ? data : JSON.stringify(data);
        try {
            const buffer = NetString.encode(this.textEncoder.encode(message), this.getTextCommand());
            array.each(this.options.autoStream
                ? this.writers.slice(0, this.currentWriteStreams)
                : this.writers, (writer) => {
                writer.write(buffer);
            });
        }
        catch (error) {
            logger.error(`send data error, ${error}`);
            if (this.onclose) {
                execute(this.onclose, this, [error]);
            }
        }
    }
    sendBinary(buffer) {
        array.each(this.writers, (writer) => {
            writer.write(this.options.mode === 'text'
                ? NetString.encode(buffer, this.options.binaryCommand)
                : buffer);
        });
    }
    getCurrentWriteStreams() {
        return this.currentWriteStreams;
    }
    setCurrentWriteStreams(value) {
        this.currentWriteStreams = restrain(value, 1, this.writers.length);
    }
    getRTT() {
        return this.rtt.getValue();
    }
    close() {
        if (this.transport) {
            this.transport.close();
            this.transport = null;
        }
        if (this.netStrings) {
            array.each(this.netStrings, (netString) => {
                netString.destroy();
            });
            this.netStrings = null;
        }
        if (this.pingTimer) {
            this.pingTimer.destroy();
            this.pingTimer = null;
        }
        if (this.textEncoder) {
            this.textEncoder = null;
        }
        if (this.textDecoder) {
            this.textDecoder = null;
        }
        if (this.pingStartTimestamp) {
            this.pingStartTimestamp.forEach(timer => {
                clearTimeout(timer);
            });
            this.pingStartTimestamp.clear();
            this.pingStartTimestamp = null;
        }
        if (this.commandMap) {
            this.commandMap.clear();
            this.commandMap = null;
        }
        this.streams = null;
        this.readers = null;
        this.writers = null;
        this.commandMap = null;
        this.commandQueue = null;
    }
    clear() {
        this.close();
    }
}
