/**
 * @file 对值的范围进行约束
 * @author zhaogaoxing
 */
/**
 * 对值的范围进行约束
 *
 * @param value 值
 * @param min 最小值
 * @param max 最大值
 *
 * @returns 约束之后的值
 */
export default function restrain(value, min, max) {
    if (value < min) {
        value = min;
    }
    else if (value > max) {
        value = max;
    }
    return value;
}
