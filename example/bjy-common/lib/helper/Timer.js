/**
 * @file 定时任务
 * @author zhaogaoxing
 */
export default class Timer {
    /**
     *
     * @param task 定时任务
     * @param timeout 多久之后开始
     * @param interval 执行间隔
     */
    constructor(task, timeout, interval) {
        this.task = task;
        this.timeout = timeout;
        this.interval = interval;
        this.count = 0;
    }
    /**
     * 开始执行
     */
    start() {
        const me = this;
        me.stop();
        let timeout = me.timeout;
        const interval = me.interval;
        const next = function () {
            me.count++;
            if (me.task() !== false
                && me.timer) {
                me.timer = setTimeout(next, interval);
            }
            else {
                me.stop();
            }
        };
        if (timeout == null) {
            timeout = interval;
        }
        me.timer = setTimeout(next, timeout);
    }
    /**
     * 停止执行
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
            this.count = 0;
        }
    }
    updateInterval(interval) {
        this.interval = interval;
    }
    /**
     * 是否正在执行
     */
    isStarted() {
        return !!this.timer;
    }
    /**
     * 销毁定时任务
     */
    destroy() {
        this.stop();
        this.task = this.timeout = this.interval = null;
    }
}
