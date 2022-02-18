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
const defaultOptions = {
    enableCommand: false,
    textCommand: 2,
    binaryCommand: 1,
    useDatagrams: false,
    streamCount: 1,
    textCommandStart: 2,
    textCommandEnd: Math.pow(2, 31) - 1,
    commandTimeout: 30 * 1000
};
export default class WebTransportWS {
    constructor(url, options) {
        this.url = url;
        this.options = object.extend({}, defaultOptions, options);
        this.textCommandPointer = this.options.textCommandStart;
        this.commandMap = new Map();
        this.commandQueue = [];
        this.streams = [];
        this.readers = [];
        this.writers = [];
        this.netString = new NetString({
            bufferSize: 1000 * 1024 * 1024,
            onDecodeText: ((message, cmd) => {
                if (this.onmessage) {

                    if (this.options.streamCount > 1) {
                        if (this.commandMap.get(cmd)) {
                            // 已经收到过
                            return;
                        }
                        execute(this.onmessage, this, [{
                                data: message
                            }]);
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
                        execute(this.onmessage, this, [{
                                data: message
                            }]);
                    }
                }
            }),
            enableCommand: this.options.enableCommand
        });
        const opts = {};
        if (is.boolean(options.allowPooling)) {
            opts.allowPooling = options.allowPooling;
        }
        if (is.array(options.serverCertificateHashes)) {
            opts.serverCertificateHashes = options.serverCertificateHashes;
        }
        this.transport = new WebTransport(this.url, opts);
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
    async read(reader) {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            this.netString.decode(value);
        }
    }
    handleRead() {
        array.each(this.readers, reader => {
            this.read(reader);
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
        nextTick(() => {
            if (this.onopen) {
                execute(this.onopen, this, [{}]);
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
    send(data) {
        const message = is.string(data) ? data : JSON.stringify(data);
        try {
            const cmd = this.getTextCommand()
            array.each(this.writers, writer => {
                writer.write(this.netString.encode(message, cmd));
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
        array.each(this.writers, writer => {
            writer.write(this.netString.encode(buffer, this.options.binaryCommand));
        });
    }
    close() {
        if (this.transport) {
            this.transport.close();
            this.transport = null;
        }
        if (this.netString) {
            this.netString.destroy();
            this.netString = null;
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
