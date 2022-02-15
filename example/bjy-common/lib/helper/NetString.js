import * as is from '../util/is.js';
import * as logger from '../util/logger.js';
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
        if (options.textDecoder) {
            this.textDecoder = options.textDecoder;
        }
        else if (is.func(TextDecoder)) {
            this.textDecoder = new TextDecoder();
        }
        else {
            logger.error('has not textDecoder to use');
        }
        if (options.textEncoder) {
            this.textEncoder = options.textEncoder;
        }
        else if (is.func(TextEncoder)) {
            this.textEncoder = new TextEncoder();
        }
        else {
            logger.error('has not textEncoder to use');
        }
        this.ringBuffer = new RingBuffer(options.bufferSize, Uint8Array);
    }
    isDigit(number) {
        return number >= 0x30 && number <= 0x39;
    }
    encode(text, cmd) {
        if (this.options.enableCommand && (!is.number(cmd) || cmd < 0)) {
            throw new Error('need cmd to encode');
        }
        if (text.length) {
            const encodeBuffer = is.string(text) ? this.textEncoder.encode(text) : text;
            const leadingString = this.options.enableCommand
                ? `${encodeBuffer.length + `${cmd}${Token.SPACE_CHAR}`.length}${Token.COLON_CHAR}${cmd}${Token.SPACE_CHAR}`
                : `${encodeBuffer.length}${Token.COLON_CHAR}`;
            const buffer = new Uint8Array(leadingString.length + encodeBuffer.length + 1);
            let i = 0;
            for (i = 0; i < leadingString.length; i++) {
                buffer[i] = leadingString.charCodeAt(i);
            }
            buffer.set(encodeBuffer, i);
            // ,
            buffer[i + encodeBuffer.length] = Token.COMMA;
            return buffer;
        }
        else {
            if (this.options.enableCommand) {
                return this.textEncoder.encode(`${`${cmd}${Token.SPACE_CHAR}`.length}${Token.COLON_CHAR}${cmd}${Token.SPACE_CHAR}${Token.COMMA_CHAR}`);
            }
            else {
                return this.textEncoder.encode(`0${Token.COLON_CHAR}${Token.COMMA_CHAR}`);
            }
        }
    }
    decode(buffer) {
        if (buffer) {
            this.ringBuffer.write(buffer);
        }
        let len = 0;
        let i = 0;
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
                const text = this.textDecoder.decode(this.ringBuffer.read(payloadLen));
                this.ringBuffer.skip(1);
                if (this.options.onDecodeText) {
                    this.options.onDecodeText(text, this.options.enableCommand ? cmd : void 0);
                }
                this.decode();
            }
            else {
                this.ringBuffer.back(i);
            }
        }
    }
    destroy() {
        this.textDecoder = null;
        this.textEncoder = null;
        this.ringBuffer = null;
        this.options = null;
    }
}
