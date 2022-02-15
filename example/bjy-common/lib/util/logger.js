/**
 * @file 日志
 * @author zhaogaoxing
 */
import * as constant from './constant.js';
import toString from '../function/toString.js';
export const TRACE = 0;
export const DEBUG = 1;
export const INFO = 2;
export const WARN = 3;
export const ERROR = 4;
export const FATAL = 5;
let defaultTag = 'bjy';
/**
 * 是否有原生的日志特性，没有必要单独实现
 */
const nativeConsole = typeof console !== constant.RAW_UNDEFINED ? console : constant.NULL, 
/**
 * 当前是否是源码调试，如果开启了代码压缩，empty function 里的注释会被干掉
 * 源码模式默认选 INFO，因为 DEBUG 输出的日志太多，会导致性能急剧下降
 */
defaultLogLevel = /bjy/.test(toString(constant.EMPTY_FUNCTION)) ? INFO : WARN, 
/**
 * console 样式前缀
 * ie 和 edge 不支持 console.log 样式
 */
stylePrefix = constant.WINDOW && /edge|msie|trident/i.test(constant.WINDOW.navigator.userAgent)
    ? constant.EMPTY_STRING
    : '%c', 
/**
 * 日志打印函数
 */
printLog = nativeConsole
    ? stylePrefix
        ? function (tag, msg, style, args) {
            if (args) {
                nativeConsole.log(stylePrefix + tag, style, msg, args);
            }
            else {
                nativeConsole.log(stylePrefix + tag, style, msg);
            }
        }
        : function (tag, msg, args) {
            if (args) {
                nativeConsole.log(tag, msg, args);
            }
            else {
                nativeConsole.log(tag, msg);
            }
        }
    : constant.EMPTY_FUNCTION;
/**
 * 全局调试开关
 */
function getLogLevel() {
    if (constant.GLOBAL) {
        const logLevel = constant.GLOBAL['BJY_LOG_LEVEL'];
        if (logLevel >= TRACE && logLevel <= FATAL) {
            return logLevel;
        }
    }
    return defaultLogLevel;
}
/**
 * 设置日志输出级别
 *
 * @param level 日志输出级别
 */
export function setLevel(level) {
    // @ts-ignore
    global['BJY_LOG_LEVEL'] = level;
}
function getStyle(backgroundColor) {
    return `background-color:${backgroundColor};border-radius:12px;color:#fff;font-size:10px;padding:3px 6px;`;
}
/**
 * 打印 trace 日志
 *
 * @param msg
 */
export function trace(msg, tag) {
    if (getLogLevel() <= TRACE) {
        printLog(`${tag || defaultTag} trace`, msg, getStyle('#999'));
    }
}
/**
 * 打印 debug 日志
 *
 * @param msg
 */
export function debug(msg, tag) {
    if (getLogLevel() <= DEBUG) {
        printLog(`${tag || defaultTag} debug`, msg, getStyle('#999'));
    }
}
/**
 * 打印 info 日志
 *
 * @param msg
 */
export function info(msg, tag) {
    if (getLogLevel() <= INFO) {
        printLog(`${tag || defaultTag} info`, msg, getStyle('#2db7f5'));
    }
}
/**
 * 打印 call 日志
 *
 * @param msg
 * @param args
 */
export function call(msg, tag, args) {
    if (getLogLevel() <= INFO) {
        printLog(`${tag || defaultTag} info`, msg, getStyle('#66cdaa'), args);
    }
}
/**
 * 打印 warn 日志
 *
 * @param msg
 */
export function warn(msg, tag) {
    if (getLogLevel() <= WARN) {
        printLog(`${tag || defaultTag} warn`, msg, getStyle('#f90'));
    }
}
/**
 * 打印 error 日志
 *
 * @param msg
 */
export function error(msg, tag) {
    if (getLogLevel() <= ERROR) {
        printLog(`${tag || defaultTag} error`, msg, getStyle('#ed4014'));
    }
}
/**
 * 致命错误，中断程序
 *
 * @param msg
 */
export function fatal(msg, tag) {
    if (getLogLevel() <= FATAL) {
        throw new Error(`[${tag || defaultTag} fatal]: ${msg}`);
    }
}
export function setDefaultTag(tag) {
    defaultTag = tag;
}
