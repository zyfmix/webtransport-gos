/**
 * @file 判断是否是 native 方法
 * @author zhaogaoxing
 */
import * as is from '../util/is.js';
import toString from './toString.js';
import * as string from '../util/string.js';
/**
 * 判断是否是 native 方法
 *
 * @param target 待判定函数
 */
export default function isNative(target) {
    return is.func(target) && string.has(toString(target), '[native code]');
}
