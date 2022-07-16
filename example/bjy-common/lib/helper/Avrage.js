export default class Avrage {
    constructor(count) {
        this.count = count;
        this.queue = [];
    }
    push(value) {
        this.queue.push(value);
        if (this.queue.length > this.count) {
            this.queue.shift();
        }
    }
    clear() {
        this.queue.length = 0;
    }
    isFull() {
        return this.queue.length === this.count;
    }
    getValue() {
        if (!this.queue.length) {
            return 0;
        }
        let sum = 0;
        for (let i = 0; i < this.queue.length; i++) {
            sum += this.queue[i];
        }
        return sum / this.queue.length;
    }
}
