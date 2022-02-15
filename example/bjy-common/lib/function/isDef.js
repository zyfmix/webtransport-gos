/**
 * @file 判断是否定义
 * @author zhaogaoxing
 */
import * as constant from '../util/constant.js';
/**
 * 判断是否定义
 *
 * @param target 待判定变量
 */
export default function isDef(target) {
    return target !== constant.UNDEFINED;
}
