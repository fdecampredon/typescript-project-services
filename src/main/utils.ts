'use strict';

import promise                 = require('./promise');
import path                    = require('path');
import project                 = require('./project');
import TypeScriptProjectConfig = project.TypeScriptProjectConfig;

/**
 * A simple Promise Queue
 */
export class PromiseQueue {
    
    /**
     * the current promise
     */
    private promise: promise.Promise<any>;
    
    /**
     * the resolve function of the initial promise
     */
    private initializer: (result: any) => any;
    
    /**
     * true if the queue has been initialized
     */
    private initialized: boolean = false;
    
    constructor() {
        this.promise = new promise.Promise(resolve => {
            this.initializer = resolve;    
        });
    }
    
    /**
     * initialize the queue subsequent call reset the queue
     * 
     * @param val the value passed as initialial result
     */
    init<T>(val: promise.Promise<T>): promise.Promise<T>;
    
    /**
     * initialize the queue subsequent call reset the queue
     * 
     * @param val the value passed as initialial result
     */
    init<T>(val: T): promise.Promise<T> {
        if (this.initialized) {
            this.promise = promise.Promise.resolve(val);
        } else {
            this.initialized = true;
            this.initializer(val);
            return this.promise;
        }
    }
    
    /**
     * enqueue an action
     */
    then<T>(action: () => promise.Promise<T>): promise.Promise<T>;
    /**
     * enqueue an action
     */
    then<T>(action: () => T): promise.Promise<T>;
    /**
     * enqueue an action
     */
    then(action: () => void): promise.Promise<void> {
        return this.promise = this.promise.then(
            () => action(), 
            () => action()
        );
    }
}


export function mapValues<T>(map: { [index: string]: T }): T[] {
    return Object.keys(map).reduce( (result: T[], key: string) => {
        result.push(map[key]);
        return result;
    }, []);
} 

/**
 * assign all properties of a list of object to an object
 * @param target the object that will receive properties
 * @param items items which properties will be assigned to a target
 */
export function assign(target: any, ...items: any[]): any {
    return items.reduce(function (target: any, source: any) {
        return Object.keys(source).reduce((target: any, key: string) => {
            target[key] = source[key];
            return target;
        }, target);
    }, target);
}

/**
 * clone an object (shallow)
 * @param target the object to clone
 */
export function clone<T>(target: T): T {
    return assign(Array.isArray(target) ? [] : {}, target);
}


export function createMap(arr: string[]): { [string: string]: boolean} {
    return arr.reduce((result: { [string: string]: boolean}, key: string) => {
        result[key] = true;
        return result;
    }, <{ [string: string]: boolean}>{});
}


/**
 * browserify path.resolve is buggy on windows
 */
export function pathResolve(from: string, to: string): string {
    var result = path.resolve(from, to);
    var index = result.indexOf(from[0]);
    return result.slice(index);
}


/**
 * Default configuration for typescript project
 */
export var typeScriptProjectConfigDefault: TypeScriptProjectConfig = {
    noLib: false,
    target: 'es3',
    module: 'none',
    noImplicitAny: false
};




/**
 * C# like events and delegates for typed events
 * dispatching
 */
export interface ISignal<T> {
    /**
     * Subscribes a listener for the signal.
     * 
     * @params listener the callback to call when events are dispatched
     * @params priority an optional priority for this signal
     */
    add(listener: (parameter: T) => any, priority?: number): void;
    
    /**
     * unsubscribe a listener for the signal
     * 
     * @params listener the previously subscribed listener
     */
    remove(listener: (parameter: T) => any): void;
    
    /**
     * dispatch an event
     * 
     * @params parameter the parameter attached to the event dispatching
     */
    dispatch(parameter?: T): boolean;
    
    /**
     * Remove all listener from the signal
     */
    clear(): void;
    
    /**
     * @return true if the listener has been subsribed to this signal
     */
    hasListeners(): boolean;
}


export class Signal<T> implements ISignal<T> {
    
    /**
     * list of listeners that have been suscribed to this signal
     */
    private listeners: { (parameter: T): any }[] = [];
    
    /**
     * Priorities corresponding to the listeners 
     */
    private priorities: number[] = [];
    
    /**
     * Subscribes a listener for the signal.
     * 
     * @params listener the callback to call when events are dispatched
     * @params priority an optional priority for this signal
     */
    add(listener: (parameter: T) => any, priority = 0): void {
        var index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.priorities[index] = priority;
            return;
        }
        for (var i = 0, l = this.priorities.length; i < l; i++) {
            if (this.priorities[i] < priority) {
                this.priorities.splice(i, 0, priority);
                this.listeners.splice(i, 0, listener);
                return;
            }
        }
        this.priorities.push(priority);
        this.listeners.push(listener);
    }
    
    /**
     * unsubscribe a listener for the signal
     * 
     * @params listener the previously subscribed listener
     */
    remove(listener: (parameter: T) => any): void {
        var index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.priorities.splice(index, 1);
            this.listeners.splice(index, 1);
        }
    }
    
    /**
     * dispatch an event
     * 
     * @params parameter the parameter attached to the event dispatching
     */
    dispatch(parameter?: T): boolean {
        var hasBeenCanceled = this.listeners.every((listener: (parameter: T) => any) =>  {
            var result = listener(parameter);
            return result !== false;
        });
        
        return hasBeenCanceled;
    }
    
    /**
     * Remove all listener from the signal
     */
    clear(): void {
        this.listeners = [];
        this.priorities = [];
    }
    
    /**
     * @return true if the listener has been subsribed to this signal
     */
    hasListeners(): boolean {
        return this.listeners.length > 0;
    }
}

export function binarySearch(array: number[], value: number): number {
    var low = 0;
    var high = array.length - 1;

    while (low <= high) {
        var middle = low + ((high - low) >> 1);
        var midValue = array[middle];

        if (midValue === value) {
            return middle;
        }
        else if (midValue > value) {
            high = middle - 1;
        }
        else {
            low = middle + 1;
        }
    }

    return ~low;
}