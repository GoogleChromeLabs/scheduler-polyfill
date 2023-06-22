/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {HostCallback} from './host-callback.js';
import {IntrusiveTaskQueue as TaskQueue} from './intrusive-task-queue.js';
import {SCHEDULER_PRIORITIES} from './scheduler-priorities.js';

/**
 * Polyfill of the scheduler API: https://wicg.github.io/scheduling-apis/.
 */
class Scheduler {
  /**
   * Constructs a Scheduler object. There should only be one Scheduler per page
   * since tasks are only run in priority order within a particular scheduler.
   */
  constructor() {
    /**
     * @const {Object<string, !TaskQueue>}
     */
    this.queues_ = {};
    SCHEDULER_PRIORITIES.forEach((priority) => {
      this.queues_[priority] = new TaskQueue();
    });

    /*
     * We only schedule a single host callback, which can be a setTimeout,
     * requestIdleCallback, or postMessage, which will run the oldest, highest
     * priority task.
     *
     * TODO(shaseley): consider an option for supporting multiple outstanding
     * callbacks, which more closely matches the current Chromium
     * implementation.
     *
     * @private
     * @type {?HostCallback}
     */
    this.pendingHostCallback_ = null;

    /**
     * This keeps track of signals we know about for priority changes. The
     * entries are (key = signal, value = current priority). When we encounter
     * a new TaskSignal (an AbortSignal with a priority property), we listen for
     * priority changes so we can move tasks between queues accordingly.
     * @const {!WeakMap<!AbortSignal, string>}
     */
    this.signals_ = new WeakMap();
  }

  /**
   * Schedules `callback` to be run asynchronously, returning a promise that is
   * resolved with the callback's result when it finishes running. The resulting
   * promise is rejected if the callback throws an exception, or if the
   * associated signal is aborted.
   *
   * Note: we aren't implementing argument passing since that will likely be
   * removed from the API.
   *
   * @param {function(): *} callback
   * @param {{signal: AbortSignal, priorty: string, delay: number}} options
   * @return {!Promise<*>}
   */
  postTask(callback, options) {
    // Make a copy since we modify some of the options.
    options = Object.assign({}, options);

    if (options.signal !== undefined) {
      // Non-numeric options cannot be null for this API. Also make sure we can
      // use this object as an AbortSignal.
      if (options.signal === null || !('aborted' in options.signal) ||
          typeof options.signal.addEventListener !== 'function') {
        return Promise.reject(new TypeError(
            `'signal' is not a valid 'AbortSignal'`));
      }
      // If this is a TaskSignal, make sure the priority is valid.
      if (options.signal && options.signal.priority &&
          !SCHEDULER_PRIORITIES.includes(options.signal.priority)) {
        return Promise.reject(new TypeError(
            `Invalid task priority: '${options.signal.priority}'`));
      }
    }

    if (options.priority !== undefined) {
      // Non-numeric options cannot be null for this API.
      if (options.priority === null ||
          !SCHEDULER_PRIORITIES.includes(options.priority)) {
        return Promise.reject(new TypeError(
            `Invalid task priority: '${options.priority}'`));
      }
    }

    if (options.delay === undefined) options.delay = 0;
    // Unlike setTimeout, postTask uses [EnforceRange] and rejects negative
    // delay values. But it also converts non-numeric values to numbers. Since
    // IDL and Number() both use the same underlying ECMAScript algorithm
    // (ToNumber()), convert the value using Number(delay) and then check the
    // range.
    options.delay = Number(options.delay);
    if (options.delay < 0) {
      return Promise.reject(new TypeError(
          `'delay' must be a positive number.`));
    }

    const task = {
      callback,
      options,

      /** The resolve function from the associated Promise.  */
      resolve: null,

      /** The reject function from the associated Promise.  */
      reject: null,

      /** The pending HostCallback, which is set iff this is a delayed task. */
      hostCallback: null,

      /**
       * The callback passed to the abort event listener, which calls
       * `onAbort` and is bound to this task via an => function.
       */
      abortCallback: null,

      onTaskCompleted: function() {
        if (!this.options.signal || !this.abortCallback) return;
        this.options.signal.removeEventListener('abort', this.abortCallback);
        this.abortCallback = null;
      },

      onTaskAborted: function() {
        // If this is a delayed task that hasn't expired yet, cancel the host
        // callback.
        if (this.hostCallback) {
          this.hostCallback.cancel();
          this.hostCallback = null;
        }
        this.options.signal.removeEventListener('abort', this.abortCallback);
        this.abortCallback = null;
        this.reject(this.options.signal.reason);
      },

      isAborted: function() {
        return this.options.signal && this.options.signal.aborted;
      },
    };

    const resultPromise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    this.schedule_(task);

    return resultPromise;
  }

  /**
   * @private
   * @param {!Object} task
   */
  schedule_(task) {
    // Handle tasks that have already been aborted or might be aborted in the
    // future.
    const signal = task.options.signal;
    if (signal) {
      if (signal.aborted) {
        task.reject(signal.reason);
        return;
      }

      task.abortCallback = () => {
        task.onTaskAborted();
      };
      signal.addEventListener('abort', task.abortCallback);
    }

    // Handle delayed tasks.
    if (task.options.delay > 0) {
      task.hostCallback = new HostCallback(() => {
        task.hostCallback = null;
        this.onTaskDelayExpired_(task);
      }, null /* priority */, task.options.delay);
      return;
    }

    this.pushTask_(task);
    this.scheduleHostCallbackIfNeeded_();
  }

  /**
   * Callback invoked when a delayed task's timeout expires.
   * @private
   * @param {!Object} task
   */
  onTaskDelayExpired_(task) {
    // We need to queue the task in the appropriate queue, most importantly
    // to ensure ordering guarantees.
    this.pushTask_(task);

    // We also use this as an entrypoint into the scheduler and run the
    // next task, rather than waiting for the pending callback or scheduling
    // another one.
    if (this.pendingHostCallback_) {
      this.pendingHostCallback_.cancel();
      this.pendingHostCallback_ = null;
    }
    this.schedulerEntryCallback_();
  }

  /**
   * Callback invoked when a priortychange event is raised for `signal`.
   * @private
   * @param {!AbortSignal} signal
   */
  onPriorityChange_(signal) {
    const oldPriority = this.signals_.get(signal);
    if (oldPriority === undefined) {
      throw new Error(
          'Attempting to change priority on an unregistered signal');
    }
    if (oldPriority === signal.priority) return;

    const sourceQueue = this.queues_[oldPriority];
    const destinationQueue = this.queues_[signal.priority];

    destinationQueue.merge(sourceQueue, (task) => {
      return task.options.signal === signal;
    });

    this.signals_.set(signal, signal.priority);
  }

  /**
   * Callback invoked when the host callback fires.
   * @private
   */
  schedulerEntryCallback_() {
    this.pendingHostCallback_ = null;
    this.runNextTask_();
    this.scheduleHostCallbackIfNeeded_();
  }

  /**
   * Schedule the next scheduler callback if there are any pending tasks.
   */
  scheduleHostCallbackIfNeeded_() {
    const priority = this.nextTaskPriority_();
    if (priority == null) return;

    // We might need to upgrade to a non-idle callback if a higher priority task
    // is scheduled, in which case we cancel the pending host callback and
    // reschedule.
    if (priority !== 'background' && this.pendingHostCallback_ &&
        this.pendingHostCallback_.isIdleCallback()) {
      this.pendingHostCallback_.cancel();
      this.pendingHostCallback_ = null;
    }

    // Either the priority of the new task is compatible with the pending host
    // callback, or it's a lower priorty (we handled the other case above). In
    // either case, the pending callback is still valid.
    if (this.pendingHostCallback_) return;

    this.pendingHostCallback_ = new HostCallback(() => {
      this.schedulerEntryCallback_();
    }, priority, 0 /* delay */);
  }

  /**
   * Compute the `task` priority and push it onto the appropriate task queue.
   * If the priority comes from the associated signal, this will set up an event
   * listener to listen for priority changes.
   * @private
   * @param {!Object} task
   */
  pushTask_(task) {
    // If an explicit priority was provided, we use that. Otherwise if a
    // TaskSignal was provided, we get the priority from that. If neither a
    // priority or TaskSignal was provided, we default to 'user-visible'.
    let priority;
    if (task.options.priority) {
      priority = task.options.priority;
    } else if (task.options.signal && task.options.signal.priority) {
      priority = task.options.signal.priority;
    } else {
      priority = 'user-visible';
    }

    // The priority should have already been validated before calling this
    // method, but check the assumption and fail loudly if it doesn't hold.
    if (!SCHEDULER_PRIORITIES.includes(priority)) {
      throw new TypeError(`Invalid task priority: ${priority}`);
    }

    // Subscribe to priority change events if this is the first time we're
    // learning about this signal.
    if (task.options.signal && task.options.signal.priority) {
      const signal = task.options.signal;
      if (!this.signals_.has(signal)) {
        signal.addEventListener('prioritychange', () => {
          this.onPriorityChange_(signal);
        });
        this.signals_.set(signal, signal.priority);
      }
    }

    this.queues_[priority].push(task);
  }

  /**
   * Run the oldest highest priority non-aborted task, if there is one.
   * @private
   */
  runNextTask_() {
    let task = null;

    // Aborted tasks aren't removed from the task queue, so we need to keep
    // looping until we find a non-aborted task. Alternatively, we should
    // consider just removing them from their queue.
    do {
      // TODO(shaseley): This can potentially run a background task in a
      // non-background task host callback.
      const priority = this.nextTaskPriority_();
      // No tasks to run.
      if (priority == null) return;

      // Note: `task` will only be null if the queue is empty, which should not
      // be the case if we found the priority of the next task to run.
      task = this.queues_[priority].takeNextTask();
    } while (task.isAborted());

    try {
      const result = task.callback();
      task.resolve(result);
    } catch (e) {
      task.reject(e);
    } finally {
      task.onTaskCompleted();
    }
  }

  /**
   * Get the priority of the next task to run.
   * @private
   * @return {?string} Returns the priority of the next task to run, or null if
   *    all queues are empty.
   */
  nextTaskPriority_() {
    for (let i = 0; i < SCHEDULER_PRIORITIES.length; i++) {
      const priority = SCHEDULER_PRIORITIES[i];
      if (!this.queues_[priority].isEmpty()) return priority;
    }
    return null;
  }
}

export {Scheduler};
