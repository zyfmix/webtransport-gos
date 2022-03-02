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
const defaultOptions = {
    enableCommand: false,
    textCommand: 20,
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
    constructor(url, options) {
        this.url = url;
        this.options = object.extend({}, defaultOptions, options);
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
        const opts = {};
        if (is.boolean(options.allowPooling)) {
            opts.allowPooling = options.allowPooling;
        }
        if (is.array(options.serverCertificateHashes)) {
            opts.serverCertificateHashes = [];
            array.each(options.serverCertificateHashes, (item) => {
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
            logger.info(`WebTransportWS closed gracefully, url: ${url}`);
            if (this.onclose) {
                execute(this.onclose, this, [{}]);
            }
        })
            .catch((error) => {
            logger.error(`WebTransportWS closed because of error: ${error}, url: ${url}`);
            if (this.onclose) {
                execute(this.onclose, this, [error]);
            }
        });
        this.connect();
    }
    async read(reader, index) {
        const netString = new NetString({
            bufferSize: this.options.bufferSize,
            onDecodeText: this.onDecodeMessage.bind(this),
            enableCommand: this.options.enableCommand,
            index
        });
        this.netStrings[index] = netString;
        while (true) {
            try {
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                netString.decode(value);
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
        if (this.options.streamCount > 1) {
            const command = this.textCommandPointer++;
            if (this.textCommandPointer > this.options.textCommandEnd) {
                this.textCommandPointer = this.options.textCommandStart;
            }
            return command;
        }
        return this.options.textCommand;
    }
    ping() {
        if (this.writers.length && this.netStrings.length) {
            const now = getTimestamp();
            const message = `${now}`;
            this.pingStartTimestamp.set(message, now);
            this.writers[0].write(this.netStrings[0].encode(message, this.options.pingCommand));
        }
    }
    onDecodeMessage(instance, message, cmd) {
        if (cmd === this.options.pingCommand) {
            // 客户端的 ping 消息返回
            if (this.pingStartTimestamp.has(message)) {
                const rtt = getTimestamp() - this.pingStartTimestamp.get(message);
                this.rtt.push(rtt);
                this.pingStartTimestamp.delete(message);
                if (is.func(this.options.onPing)) {
                    this.options.onPing(this, rtt);
                }
            }
        }
        else if (cmd === this.options.serverPingCommand) {
            // 服务器的 ping 消息直接原样返回
            if (this.writers.length && this.netStrings.length) {
                this.writers[instance.options.index].write(this.netStrings[0].encode(message, cmd));
            }
        }
        else if (cmd >= this.options.textCommandStart && cmd <= this.options.textCommandEnd) {
            if (this.options.streamCount > 1) {
                if (this.commandMap.get(cmd)) {
                    // 已经收到过
                    return;
                }
                if (this.onmessage) {
                    execute(this.onmessage, this, [{
                            data: message
                        }]);
                }
                this.commandMap.set(cmd, true);
                this.commandQueue.push({
                    cmd,
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
                            data: message
                        }]);
                }
            }
        }
    }
    send(data) {
        const message = is.string(data) ? data : JSON.stringify(data);
        try {
            const command = this.getTextCommand();
            const buffer = this.netStrings[0].encode(message, command);
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
            writer.write(this.netStrings[0].encode(buffer, this.options.binaryCommand));
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
