/**
 * @file 路径操作
 * @author zhaogaoxing
 */
import * as string from './string.js';
import * as constant from './constant.js';
const dotPattern = /\./g, asteriskPattern = /\*/g, doubleAsteriskPattern = /\*\*/g, splitCache = {}, patternCache = {};
/**
 * 判断 keypath 是否以 prefix 开头，如果是，返回匹配上的前缀长度，否则返回 -1
 *
 * @param keypath
 * @param prefix
 * @return
 */
export function match(keypath, prefix) {
    if (keypath === prefix) {
        return prefix.length;
    }
    prefix += constant.RAW_DOT;
    return string.startsWith(keypath, prefix)
        ? prefix.length
        : constant.MINUS_ONE;
}
/**
 * 遍历 keypath 的每个部分
 *
 * @param keypath
 * @param callback 返回 false 可中断遍历
 */
export function each(keypath, callback) {
    /*
     * 如果 keypath 是 toString 之类的原型字段
     * splitCache[keypath] 会取到原型链上的对象
     */
    const list = splitCache.hasOwnProperty(keypath)
        ? splitCache[keypath]
        : (splitCache[keypath] = keypath.split(constant.RAW_DOT));
    for (let i = 0, lastIndex = list.length - 1; i <= lastIndex; i++) {
        if (callback(list[i], i === lastIndex) === constant.FALSE) {
            break;
        }
    }
}
/**
 * 路径组合
 *
 * @param keypath1
 * @param keypath2
 */
export function join(keypath1, keypath2) {
    return keypath1 && keypath2
        ? keypath1 + constant.RAW_DOT + keypath2
        : keypath1 || keypath2;
}
/**
 * 是否是模糊匹配
 *
 * @param keypath
 */
export function isFuzzy(keypath) {
    return string.has(keypath, constant.RAW_WILDCARD);
}
/**
 * 模糊匹配 keypath
 *
 * @param keypath 待匹配路径
 * @param pattern 匹配规则
 */
export function matchFuzzy(keypath, pattern) {
    let cache = patternCache[pattern];
    if (!cache) {
        const str = pattern
            .replace(dotPattern, '\\.')
            .replace(asteriskPattern, '(\\w+)')
            .replace(doubleAsteriskPattern, '([\.\\w]+?)');
        cache = patternCache[pattern] = new RegExp(`^${str}$`);
    }
    const result = keypath.match(cache);
    if (result) {
        return result[1];
    }
}
/**
 * 返回 keypath 的根路径
 *
 * @param keypath
 */
export function rootPath(keypath) {
    return keypath && keypath.split(constant.RAW_DOT).shift();
}
