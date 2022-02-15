/**
 * @file 数据传输器抽象，统一接口，底层传输通道可以是 ws，datachannel，小程序的 ws 等任何部署有 TransportInterface 接口的实现
 * @author zhaogaoxing
 */
import * as is from '../util/is.js';
import * as object from '../util/object.js';
import * as logger from '../util/logger.js';
export var TransportStatus;
(function (TransportStatus) {
    TransportStatus[TransportStatus["NONE"] = 0] = "NONE";
    TransportStatus[TransportStatus["OPEN"] = 1] = "OPEN";
    TransportStatus[TransportStatus["ERROR"] = 2] = "ERROR";
    TransportStatus[TransportStatus["CLOSE"] = 3] = "CLOSE";
    TransportStatus[TransportStatus["CLOSING"] = 4] = "CLOSING";
    TransportStatus[TransportStatus["TIMEOUT"] = 5] = "TIMEOUT";
    TransportStatus[TransportStatus["CONNECTING"] = 6] = "CONNECTING";
})(TransportStatus || (TransportStatus = {}));
class Transport {
    constructor(options) {
        object.extend(this, options);
        this.status = TransportStatus.NONE;
        this.queue = [];
        this.isReconnect = false;
        if (options.retryCount > 0) {
            this.retryIndex = 0;
        }
    }
    isOpen() {
        return this.status === TransportStatus.OPEN;
    }
    isConnecting() {
        return this.status === TransportStatus.CONNECTING;
    }
    /**
     * 连接到一个服务器
     *
     * 可提供代理服务器列表，如果 server 连接失败，则依次尝试代理
     *
     * @param server 首选地址
     * @param proxys 代理地址列表
     */
    connect(server, proxys) {
        const me = this;
        this.server = server;
        this.proxys = proxys;
        if (me.status === TransportStatus.OPEN
            || me.status === TransportStatus.CONNECTING
            || me.status === TransportStatus.CLOSING) {
            return;
        }
        const connectServer = function (server, callback) {
            let options = me.nativeOptions;
            if (me.native === WebSocket) {
                // @ts-ignore
                options = me.nativeOptions.protocols;
            }
            logger.debug(`${me.tag || 'Transport'} connecting url: ${server.url}`);
            const socket = new me.native(server.url, options);
            let timer;
            let connectComplete = function (status) {
                if (timer) {
                    clearTimeout(timer);
                }
                socket.onopen = socket.onerror = null;
                callback(socket, server, status);
            };
            socket.onopen = function () {
                connectComplete(TransportStatus.OPEN);
            };
            socket.onerror = function () {
                connectComplete(TransportStatus.ERROR);
            };
            if (me.timeout > 0) {
                timer = setTimeout(function () {
                    timer = null;
                    connectComplete(TransportStatus.TIMEOUT);
                }, me.timeout);
            }
        };
        let servers = [server];
        if (proxys && proxys.length) {
            servers = servers.concat(proxys);
        }
        let serverIndex = -1;
        const nextStart = function () {
            me.nextStartTimer = null;
            if (me.status !== TransportStatus.CONNECTING) {
                if (me.status === TransportStatus.CLOSING) {
                    me.status = TransportStatus.CLOSE;
                }
                return;
            }
            connectServer(servers[++serverIndex], function (socket, server, status) {
                if (me.status !== TransportStatus.CONNECTING) {
                    if (me.status === TransportStatus.CLOSING) {
                        let lazyClose = false;
                        if (status === TransportStatus.OPEN
                            && me.refreshQueueOnClose
                            && me.queue.length) {
                            while (me.queue.length) {
                                const data = me.queue.shift();
                                const payload = is.string(data) ? data : JSON.stringify(data);
                                socket.send(payload);
                                logger.trace(`${me.tag || 'Transport'} Sent: ${payload}`);
                                if (me.onSend) {
                                    me.onSend(data);
                                }
                            }
                            lazyClose = true;
                        }
                        if (lazyClose) {
                            setTimeout(() => {
                                socket.close();
                                me.status = TransportStatus.CLOSE;
                            }, 1000);
                        }
                        else {
                            socket.close();
                            me.status = TransportStatus.CLOSE;
                        }
                    }
                    return;
                }
                if (status === TransportStatus.OPEN) {
                    me.url = server.url;
                    me.socket = socket;
                    me.status = TransportStatus.OPEN;
                    socket.onmessage = function (event) {
                        if (me.status === TransportStatus.OPEN) {
                            logger.trace(`${me.tag || 'Transport'} Received: ${event.data}`);
                            if (me.onReceive) {
                                me.onReceive(JSON.parse(event.data));
                            }
                            if (me.onmessage) {
                                me.onmessage(event.data);
                            }
                        }
                    };
                    socket.onclose = function (event) {
                        if (me.status === TransportStatus.OPEN) {
                            if (me.connectOnClose) {
                                me.status = TransportStatus.NONE;
                                if (me.onReconnecting) {
                                    me.onReconnecting();
                                }
                                me.isReconnect = true;
                                logger.warn(`${me.tag || 'Transport'} reconnecting`);
                                if (socket.clear) {
                                    socket.clear();
                                }
                                me.connect(server, proxys);
                            }
                            else if (me.onClose) {
                                me.onClose(event);
                            }
                        }
                    };
                    if (me.retryCount > 0) {
                        me.retryIndex = 0;
                    }
                    if (me.onOpen) {
                        logger.debug(`${me.tag || 'Transport'} ${me.isReconnect ? 'reconnect' : 'connect'} success`);
                        me.onOpen({
                            server: server,
                            reconnect: me.isReconnect
                        });
                    }
                    if (me.queue.length) {
                        while (me.queue.length) {
                            const data = me.queue.shift();
                            const payload = is.string(data) ? data : JSON.stringify(data);
                            socket.send(payload);
                            logger.trace(`${me.tag || 'Transport'} Sent: ${payload}`);
                        }
                    }
                }
                else if (serverIndex === servers.length - 1) {
                    if (me.retryCount > 0
                        && me.retryIndex++ < me.retryCount - 1) {
                        serverIndex = -1;
                        nextEnd();
                        return;
                    }
                    switch (me.status = status) {
                        case TransportStatus.ERROR:
                            logger.error(`${me.tag || 'Transport'} ${me.isReconnect ? 'reconnect' : 'connect'} error`);
                            if (me.onError) {
                                me.onError({
                                    server: server
                                });
                            }
                            break;
                        case TransportStatus.TIMEOUT:
                            logger.error(`${me.tag || 'Transport'} ${me.isReconnect ? 'reconnect' : 'connect'} timeout`);
                            if (me.onTimeout) {
                                me.onTimeout({
                                    server: server
                                });
                            }
                            break;
                    }
                }
                else {
                    nextEnd();
                }
            });
        };
        const nextEnd = function () {
            if (me.interval > 0) {
                me.nextStartTimer = setTimeout(nextStart, me.interval);
            }
            else {
                nextStart();
            }
        };
        me.status = TransportStatus.CONNECTING;
        nextStart();
    }
    send(data) {
        if (this.status !== TransportStatus.OPEN) {
            if (this.queueMax > 0 && this.queue.length === this.queueMax) {
                this.queue.shift();
            }
            this.queue.push(data);
            return;
        }
        const socket = this.socket;
        if (socket) {
            const payload = is.string(data) ? data : JSON.stringify(data);
            socket.send(payload);
            logger.trace(`${this.tag || 'Transport'} Sent: ${payload}`);
            if (this.onSend) {
                this.onSend(data);
            }
        }
    }
    close() {
        const socket = this.socket;
        this.socket = null;
        this.status = TransportStatus.CLOSING;
        if (socket) {
            let layzeClose = false;
            if (this.refreshQueueOnClose && this.queue.length) {
                while (this.queue.length) {
                    this.send(this.queue.shift());
                }
                layzeClose = true;
            }
            socket.onmessage = socket.onclose = null;
            if (layzeClose) {
                setTimeout(() => {
                    socket.close();
                    this.status = TransportStatus.CLOSE;
                }, 1000);
            }
            else {
                socket.close();
                this.status = TransportStatus.CLOSE;
            }
        }
        if (this.nextStartTimer) {
            clearTimeout(this.nextStartTimer);
            this.nextStartTimer = null;
        }
    }
    reconnect() {
        if (this.status !== TransportStatus.CONNECTING) {
            this.close();
            if (this.status === TransportStatus.CLOSING) {
                setTimeout(() => {
                    this.status = TransportStatus.CLOSE;
                    this.connect(this.server, this.proxys);
                }, 1000);
            }
            else {
                this.connect(this.server, this.proxys);
            }
        }
    }
    getSocket() {
        return this.socket;
    }
}
export default Transport;
