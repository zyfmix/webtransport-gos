/**
 * @file netstring 实现
 * @author zhaogaoxing
 */
import * as is from '../util/is.js';
import RingBuffer from './RingBuffer.js';
var Token;
(function (Token) {
    Token[Token["COLON"] = 58] = "COLON";
    Token["COLON_CHAR"] = ":";
    Token[Token["COMMA"] = 44] = "COMMA";
    Token["COMMA_CHAR"] = ",";
    Token[Token["SPACE"] = 32] = "SPACE";
    Token["SPACE_CHAR"] = " ";
})(Token || (Token = {}));
export default class NetString {
    constructor(options) {
        this.options = options;
        this.ringBuffer = new RingBuffer(options.bufferSize, Uint8Array);
    }
    isDigit(number) {
        return number >= 0x30 && number <= 0x39;
    }
    static encode(payload, cmd) {
        const enableCommand = is.number(cmd) && cmd >= 0;
        const leadingString = enableCommand
            ? `${payload.length + `${cmd}${Token.SPACE_CHAR}`.length}${Token.COLON_CHAR}${cmd}${Token.SPACE_CHAR}`
            : `${payload.length}${Token.COLON_CHAR}`;
        const buffer = new Uint8Array(leadingString.length + payload.length + 1);
        let i;
        for (i = 0; i < leadingString.length; i++) {
            buffer[i] = leadingString.charCodeAt(i);
        }
        buffer.set(payload, i);
        // ,
        buffer[i + payload.length] = Token.COMMA;
        return buffer;
    }
    decode(buffer) {
        if (buffer) {
            this.ringBuffer.write(buffer);
        }
        let len = 0;
        let i = 0;
        let startPointer = this.ringBuffer.getCurrentPointer();
        if (this.ringBuffer.getLength() >= 3) {
            if (this.ringBuffer.getByteByIndex(0) === 0x30
                && this.isDigit(this.ringBuffer.getByteByIndex(1))) {
                throw new Error('find leading zeros!');
            }
            if (!this.isDigit(this.ringBuffer.getByteByIndex(0))) {
                throw new Error('the netstring must start with a number');
            }
            while (this.ringBuffer.getLength() && this.isDigit(this.ringBuffer.getByteByIndex(0))) {
                if (i > 9) {
                    throw new Error('length is more than 9 digits');
                }
                len = len * 10 + (this.ringBuffer.readByte() - 0x30);
                i++;
            }
            if (!this.ringBuffer.getLength()) {
                this.ringBuffer.back(i);
                return;
            }
            if (this.ringBuffer.readByte() !== Token.COLON) {
                throw new Error('miss the colon');
            }
            else {
                i++;
            }
            if (len + 1 <= this.ringBuffer.getLength()) {
                let cmd = 0;
                let payloadLen = len;
                if (this.options.enableCommand) {
                    while (this.ringBuffer.getLength() && this.isDigit(this.ringBuffer.getByteByIndex(0))) {
                        cmd = cmd * 10 + (this.ringBuffer.readByte() - 0x30);
                        payloadLen--;
                    }
                    if (this.ringBuffer.readByte() !== Token.SPACE) {
                        throw new Error('miss the space');
                    }
                    else {
                        payloadLen--;
                    }
                }
                if (this.ringBuffer.getByteByIndex(payloadLen) !== Token.COMMA) {
                    throw new Error('miss the comma');
                }
                const payload = this.ringBuffer.read(payloadLen);
                this.ringBuffer.skip(1);
                const serialized = this.ringBuffer.readByRange(startPointer, this.ringBuffer.getCurrentPointer());
                if (this.options.onDecodeText) {
                    this.options.onDecodeText(this, {
                        payload,
                        serialized,
                        cmd: this.options.enableCommand ? cmd : void 0
                    });
                }
                this.decode();
            }
            else {
                this.ringBuffer.back(i);
            }
        }
    }
    destroy() {
        this.ringBuffer = null;
        this.options = null;
    }
}
