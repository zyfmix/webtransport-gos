/**
 * @file 判断
 * @author zhaogaoxing
 */
import * as constant from './constant.js';
/**
 * Check if value is a function.
 *
 * @param value
 * @return
 */
export function func(value) {
    return typeof value === constant.RAW_FUNCTION;
}
/**
 * Check if value is an array.
 *
 * @param value
 * @return
 */
export function array(value) {
    return Array.isArray(value);
}
/**
 * Check if value is an object.
 *
 * @param value
 * @return
 */
export function object(value) {
    // 低版本 IE 会把 null 当作 object
    return value !== constant.NULL && typeof value === 'object';
}
/**
 * Check if value is a string.
 *
 * @param value
 * @return
 */
export function string(value) {
    return typeof value === 'string';
}
/**
 * Check if value is a number.
 *
 * @param value
 * @return
 */
export function number(value) {
    return typeof value === 'number' && !isNaN(value);
}
/**
 * Check if value is boolean.
 *
 * @param value
 * @return
 */
export function boolean(value) {
    return typeof value === 'boolean';
}
/**
 * Check if value is numeric.
 *
 * @param value
 * @return
 */
export function numeric(value) {
    return number(value)
        || (string(value) && !isNaN(parseFloat(value)) && isFinite(+value));
}
const hasOwn = {}.hasOwnProperty;
/**
 * 判断是不是普通字面量对象
 *
 * @param {*} target
 * @return {boolean}
 */
export function isPlainObject(target) {
    if (!object(target) || target.nodeType || target === target.window) {
        return false;
    }
    if (target.constructor
        && !hasOwn.call(target, 'constructor')
        && !hasOwn.call(target.constructor.prototype || {}, 'isPrototypeOf')) {
        return false;
    }
    let key;
    for (key in target) {
        /* empty */
    }
    return key === undefined || hasOwn.call(target, key);
}
/**
 * 判断 value 是否在指定范围中
 *
 * @param value 待判断值
 * @param min 范围左区间
 * @param max 范围右区间
 */
export function range(value, min, max) {
    return value >= min && value <= max;
}
