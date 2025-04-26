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

import {SCHEDULER_PRIORITIES} from './scheduler-priorities.js';

/**
 * The TaskSignal interface represents a signal object that allows you to
 * communicate with a prioritized task, and abort it or change the priority
 * via a TaskController object.
 */
class TaskSignal extends AbortSignal {
  /**
   * Make a TaskSignal instance from a TaskController instance.
   * @private
   * @param {TaskController} controller
   * @param {string} priority
   */
  static make_(controller, priority) {
    Object.setPrototypeOf(controller.signal, TaskSignal.prototype);
    controller.signal.priority_ = priority;
  }

  /**
   * The priority of the task, user-visible by default.
   * @readonly
   * @type {string}
   */
  get priority() {
    /**
     * @private
     * @type {string}
     */
    return this.priority_;
  }

  /**
   * The callback to be called when the priority of the task changes.
   * @param {Function} callback
   */
  set onprioritychange(callback) {
    if (this.onprioritychange_) {
      this.removeEventListener('prioritychange', this.onprioritychange_);
    }
    this.addEventListener('prioritychange', callback);
    /**
     * @private
     * @type {Function}
     */
    this.onprioritychange_ = callback;
  }

  /**
   * The callback to be called when the priority of the signal changes.
   * @type {Function}
   */
  get onprioritychange() {
    return this.onprioritychange_ || null;
  }
}

/**
 * Event type used for priority change events:
 * https://wicg.github.io/scheduling-apis/#sec-task-priority-change-event.
 */
class TaskPriorityChangeEvent extends Event {
  /**
   * Constructs a TaskPriorityChangeEvent. Events of this type are typically
   * named 'prioritychange', which is the name used for events triggered by
   * TaskController.setPriority().
   *
   * @param {?string} typeArg
   * @param {{previousPriority: string}} init
   */
  constructor(typeArg, init) {
    if (!init || !SCHEDULER_PRIORITIES.includes(init.previousPriority)) {
      throw new TypeError(`Invalid task priority: '${init.previousPriority}'`);
    }
    super(typeArg);
    this.previousPriority = init.previousPriority;
  }
}

/**
 * TaskController enables changing the priority of tasks associated with its
 * TaskSignal.
 */
class TaskController extends AbortController {
  /**
   * @param {{priority: string}} init
   */
  constructor(init = {}) {
    super();

    if (init == null) init = {};
    if (typeof init !== 'object') {
      throw new TypeError(`'init' is not an object`);
    }

    const priority =
        init.priority === undefined ? 'user-visible' : init.priority;
    if (!SCHEDULER_PRIORITIES.includes(priority)) {
      throw new TypeError(`Invalid task priority: '${priority}'`);
    }

    /**
     * @private
     * @type {boolean}
     */
    this.isPriorityChanging_ = false;

    TaskSignal.make_(this, priority);
  }

  /**
   * Change the priority of all tasks associated with this controller's signal.
   * @param {string} priority
   */
  setPriority(priority) {
    if (!SCHEDULER_PRIORITIES.includes(priority)) {
      throw new TypeError('Invalid task priority: ' + priority);
    }
    if (this.isPriorityChanging_) throw new DOMException('', 'NotAllowedError');
    if (this.signal.priority === priority) return;

    this.isPriorityChanging_ = true;

    const previousPriority = this.signal.priority_;
    this.signal.priority_ = priority;

    const e = new TaskPriorityChangeEvent('prioritychange', {previousPriority});
    this.signal.dispatchEvent(e);

    this.isPriorityChanging_ = false;
  }
}

export {TaskController, TaskSignal, TaskPriorityChangeEvent};
