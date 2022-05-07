/*----------------------------------*/
/* Copyright 2022 Gregor Katzschner */
/*----------------------------------*/

const fs = require('fs');
const EventEmitter = require('events');

class FileHandler {
    lock = new Set();
    emitter = new EventEmitter();
    orderStack = new WorkingStack();
    timeout;

    /**
     * Constructor for the class.
     * @param maxSyncWrites - the maximum number of writes to emit synchronously before waiting for the next tick
     * @param timeout - the number of milliseconds to wait for the next tick
     */
    constructor(maxSyncWrites = 1000, timeout = 10) {
        this.emitter.setMaxListeners(maxSyncWrites);
    }

    /**
     * Write content to a file.
     * @param path - the path to the file
     * @param content - the content to write to the file
     * @returns The function returns a promise that resolves when the file has been written.
     */
    async write(path, content) {
        if (this.emitter.listenerCount(('write')) === this.emitter.getMaxListeners()) {
            setTimeout(() => {
                console.log('retrying');
                this.read(path).then(resolve).catch(reject);
            }, this.timeout);
        } else {
            const order = new Order(path, 'write', content);
            this.orderExecution(order);
        }
    }

    /**
     * Reads the contents of a file.
     * @param path - the path to the file
     * @returns The function returns a promise that resolves with the contents of the file.
     */
    async read(path) {
        return new Promise((resolve, reject) => {
            // check if max listeners is reached and retry after timeout
            if (this.emitter.listenerCount(('read')) === this.emitter.getMaxListeners()) {
                setTimeout(() => {
                    this.read(path).then(resolve).catch(reject);
                }, this.timeout);
            } else {
                const order = new Order(path, 'read');
                this.orderExecution(order);
                this.emitter.on('read', (data) => {
                    if (data.order.id === order.id) {
                        resolve(data.content);
                    }
                });
            }
        });
    }

    /**
     * Create a file at the given path.
     * @param path - the path to the file
     * @returns A promise that resolves when the file is created.
     */
    async create(path) {
        if (this.emitter.listenerCount(('create')) === this.emitter.getMaxListeners()) {
            setTimeout(() => {
                this.read(path).then(resolve).catch(reject);
            }, this.timeout);
        } else {
            const order = new Order(path, 'create', content);
            this.orderExecution(order);
        }
    }

    /**
     * Delete a file or directory.
     * @param path - the path to the file or directory
     * @returns A promise that resolves when the file or directory is deleted.
     */
    async delete(path) {
        if (this.emitter.listenerCount(('delete')) === this.emitter.getMaxListeners()) {
            setTimeout(() => {
                this.read(path).then(resolve).catch(reject);
            }, this.timeout);
        } else {
            const order = new Order(path, 'delete', content);
            this.orderExecution(order);
        }
    }

    /**
     * Append content to a file.
     * @param path - the path to the file
     * @param content - the content to append to the file
     * @returns The function returns a promise that resolves when the content is appended to the file.
     */
    async append(path, content) {
        if (this.emitter.listenerCount() === this.emitter.getMaxListeners()) {
            setTimeout(() => {
                this.read(path).then(resolve).catch(reject);
            }, this.timeout);
        } else {
            const order = new Order(path, 'append', content);
            this.orderExecution(order);
        }
    }

    /**
     * This function pushes an order onto the order stack and then executes the order.
     * @param order - the order to push onto the stack
     */
    async orderExecution(order) {
        this.orderStack.push(order);
        this.executeOrder(order.id);
    }

    /**
     * Execute an order.
     * @param id - the id of the order to execute
     */
    async executeOrder(id) {
        // check if order is in the stack
        if (!this.orderStack.getStack().find(order => order.id === id)) return;
        const order = this.orderStack.getOrderById(id);
        // if order id is locked then retry later
        if (this.lock.has(order.path)) {
            setTimeout(() => {
                this.orderStack.push(order);
                this.executeOrder(id);
            }, this.timeout);
            return;
        } else {
            // get order by id from order stack
            // if order is null return immediately
            if (!order) {
                return;
            }
            // lock order id
            this.lock.add(order.path);
            // execute order
            switch (order.type) {
                case 'read':
                    this.readFilePrivate(order).then(() => {
                        this.lock.delete(order.path);
                    });
                    break;
                case 'write':
                    this.writeFilePrivate(order).then(() => {
                        this.lock.delete(order.path);
                    });
                    break;
                case 'delete':
                    this.deleteFilePrivate(order).then(() => {
                        this.lock.delete(order.path);
                    });
                    break;
                case 'create':
                    this.createFilePrivate(order).then(() => {
                        this.lock.delete(order.path);
                    });
                    break;
                case 'append':
                    this.appendFilePrivate(order).then(() => {
                        this.lock.delete(order.path);
                    });
                    break;
                default:
                    this.emitter.emit('error', { order: order, error: true, err: 'Unknown order type' });
                    break;
            }
        }
    }

    /**
     * This is a private function -- please not use it
     * @param order
     */
    async readFilePrivate(order) {
        fs.readFile(order.path, (err, data) => {
            if (err) {
                this.emitter.emit('error', err);
            } else {
                this.emitter.emit('read', { order, content: data.toString() });
            }
        });
    }

    /**
     * This is a private function -- please not use it
     * @param order
     */
    async writeFilePrivate(order) {
        fs.writeFile(order.path, order.data, (err) => {
            if (err) {
                this.emitter.emit('error', err);
            } else {
                this.emitter.emit('write', { order });
            }
        });
    }

    /**
     * This is a private function -- please not use it
     * @param order
     */
    async deleteFilePrivate(order) {
        fs.unlink(order.path, (err) => {
            if (err) {
                this.emitter.emit('error', err);
            } else {
                this.emitter.emit('delete', { order });
            }
        });
    }

    /**
     * This is a private function -- please not use it
     * @param order
     */
    async createFilePrivate(order) {
        fs.writeFile(order.path, order.data, (err) => {
            if (err) {
                this.emitter.emit('error', err);
            } else {
                this.emitter.emit('create', { order });
            }
        });
    }

    /**
     * This is a private function -- please not use it
     * @param order
     */
    async appendFilePrivate(order) {
        fs.appendFile(order.path, order.data, (err) => {
            if (err) {
                this.emitter.emit('error', err);
            } else {
                this.emitter.emit('append', { order });
            }
        });
    }

}

class WorkingStack {
    stack = [];

    /**
     * Given an order id, return the order with that id.
     * @param id - the id of the order we're looking for
     * @returns The function returns the order with the given id if it exists, otherwise it returns null.
     */
    getOrderById(id) {
        let order = this.stack.find(order => order.id === id);
        if (order) {
            this.stack.splice(this.stack.indexOf(order), 1);
        } else {
            return null;
        }
        return order;
    }

    /**
     * Given an order id, return the order object.
     * @param id - the id of the order
     * @returns The function returns the order object if the order is found, otherwise it returns null.
     */
    peekOrderById(id) {
        let order = this.stack.find(order => order.id === id);
        if (order) {
            return order;
        } else {
            return null;
        }
    }

    /**
     * Adds an item to the end of the stack.
     * @param item - the item to add to the stack
     */
    push(item) {
        this.stack.push(item);
    }

    /**
     * Returns last element of stack and deleted it from the stack.
     * @returns The function returns the last element of the stack
     */
    pop() {
        return this.stack.pop();
    }

    /**
     * Returns the last item in the stack.
     * @returns The last item in the stack.
     */
    peek() {
        return this.stack[this.stack.length - 1];
    }

    /**
     * @returns The function returns true if the stack is empty, otherwise false.
     */
    isEmpty() {
        return this.stack.length === 0;
    }

    /**
     * Return the number of items in the stack.
     * @returns The number of items in the stack.
     */
    size() {
        return this.stack.length;
    }

    /**
     * Clears the stack.
     */
    clear() {
        this.stack = [];
    }

    /**
     * Get the stack of the current function.
     * @returns The function returns an array of strings, each string representing a line of the stack.
     */
    getStack() {
        return this.stack;
    }
}

class Order {
    path = '';
    type = '';
    data = '';
    id = '';

    /**
     * Constructor for a new File object.
     * @param path - the path to the file
     * @param type - the type of the file
     * @param [data] - the data of the file
     */
    constructor(path, type, data = "") {
        // generate id
        this.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        // check if type is valid
        if (type !== 'read' && type !== 'write' && type !== 'delete' && type !== 'create' && type !== 'append') {
            throw new Error('type must be read, write, delete, create or append');
        }
        this.path = path;
        this.type = type;
        this.data = data;
    }

    /**
     * Returns a JSON representation of the object.
     * @returns A JSON representation of the object.
     */
    getAsJsonElement() {
        return {
            path: this.path,
            type: this.type,
            data: this.data
        };
    }
}

module.exports = FileHandler;