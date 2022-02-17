/**
 * 包装 WebTransport 成 html5 的 ws
 */
import * as is from '../util/is.js';
import NetString from './NetString.js';
import * as logger from '../util/logger.js';
import execute from '../function/execute.js';
import nextTick from '../function/nextTick.js';
export default class WebTransportWS {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.netString = new NetString({
            bufferSize: 1000 * 1024 * 1024,
            onDecodeText: ((message) => {
                if (this.onmessage) {
                    execute(this.onmessage, this, [{
                            data: message
                        }]);
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
    async read() {
        while (true) {
            const { value, done } = await this.reader.read();
            if (done) {
                break;
            }
            this.netString.decode(value);
        }
    }
    async connect() {
        await this.transport.ready;
        if (this.options.useDatagrams) {
            this.reader = this.transport.datagrams.readable.getReader();
            this.writer = this.transport.datagrams.writable.getWriter();
        }
        else {
            this.stream = await this.transport.createBidirectionalStream();
            this.reader = this.stream.readable.getReader();
            this.writer = this.stream.writable.getWriter();
        }
        nextTick(() => {
            if (this.onopen) {
                execute(this.onopen, this, [{}]);
            }
        });
        this.read();
    }
    send(data) {
        const message = is.string(data) ? data : JSON.stringify(data);
        try {
            this.writer.write(this.netString.encode(message, this.options.textCommand));
        }
        catch (error) {
            logger.error(`send data error, ${error}`);
            if (this.onclose) {
                execute(this.onclose, this, [error]);
            }
        }
    }
    sendBinary(buffer) {
        this.writer.write(this.netString.encode(buffer, this.options.binaryCommand));
    }
    close() {
        if (this.transport) {
            this.transport.close();
            this.transport = null;
        }
        if (this.stream) {
            this.stream = null;
        }
        if (this.reader) {
            this.reader = null;
        }
        if (this.writer) {
            this.writer = null;
        }
        if (this.netString) {
            this.netString.destroy();
            this.netString = null;
        }
    }
    clear() {
        this.close();
    }
}
