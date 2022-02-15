/**
 * @file string 操作
 * @author zhaogaoxing
 */
import * as is from './is.js';
import * as constant from './constant.js';
import toString from '../function/toString.js';
const capitalizePattern = /^[a-z]/, capitalizeCache = {};
/**
 * 首字母大写
 *
 * @param str
 * @return
 */
export function capitalize(str) {
    if (!capitalizeCache[str]) {
        capitalizeCache[str] = str.replace(capitalizePattern, upper);
    }
    return capitalizeCache[str];
}
/**
 * 清除两侧空白符
 *
 * @param str
 * @return 清除两侧空白符的字符串
 */
export function trim(str) {
    return falsy(str)
        ? constant.EMPTY_STRING
        : str.trim();
}
/**
 * 截取字符串
 *
 * @param str
 * @param start
 * @param end
 * @return
 */
export function slice(str, start, end) {
    return is.number(end)
        ? start === end
            ? constant.EMPTY_STRING
            : str.slice(start, end)
        : str.slice(start);
}
/**
 * 获取子串的起始位置
 *
 * @param str
 * @param part
 * @param start
 * @return
 */
export function indexOf(str, part, start) {
    return str.indexOf(part, start !== constant.UNDEFINED ? start : 0);
}
/**
 * 获取子串的起始位置
 *
 * @param str
 * @param part
 * @param end
 * @return
 */
export function lastIndexOf(str, part, end) {
    return str.lastIndexOf(part, end !== constant.UNDEFINED ? end : str.length);
}
/**
 * str 是否以 part 开头
 *
 * @param str
 * @param part
 * @return
 */
export function startsWith(str, part) {
    return indexOf(str, part) === 0;
}
/**
 * str 是否以 part 结束
 *
 * @param str
 * @param part
 * @return
 */
export function endsWith(str, part) {
    const offset = str.length - part.length;
    return offset >= 0 && lastIndexOf(str, part) === offset;
}
/**
 * 获取某个位置的字符
 */
export function charAt(str, index) {
    return str.charAt(index || 0);
}
/**
 * 获取某个位置的字符编码
 */
export function codeAt(str, index) {
    return str.charCodeAt(index || 0);
}
/**
 * 大写格式
 */
export function upper(str) {
    return str.toUpperCase();
}
/**
 * 小写格式
 */
export function lower(str) {
    return str.toLowerCase();
}
/**
 * str 是否包含 part
 *
 * @param str
 * @param part
 * @return 是否包含
 */
export function has(str, part) {
    return indexOf(str, part) >= 0;
}
/**
 * 判断长度大于 0 的字符串
 *
 * @param str
 * @return
 */
export function falsy(str) {
    return !is.string(str) || !str.length;
}
const formatRegExp = /%[sdv%]/g;
/**
 * 格式化输出
 *
 * @param string
 * @param args
 * @returns
 */
export function format(string, args) {
    let i = 0;
    const length = args.length;
    return string.replace(formatRegExp, (str) => {
        if (i >= length) {
            // missing argument
            return str;
        }
        const arg = args[i++];
        switch (str) {
            case '%%':
                return '%';
            case '%s':
                return String(arg);
            case '%d':
                return toString(Number(arg));
            case '%v':
                return '';
        }
        return str;
    });
}
