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

/**
 * This represents the overall task queuing order and is used for moving tasks
 * between task queues for priority changes.
 * @private
 * @type {number}
 */
let nextSequence = 0;

/**
 * An implementation of a task queue that augments the data being stored with
 * pointers to the previous and next entries. Storing the pointers on the data
 * reduces the number of objects created, cutting down on object churn.
 *
 * This task queue is implemented as a doubly-linked list, optimizing for
 * queueing and dequeing, as well as performant merges for priority change.
 *
 * This adds the following properties to tasks it owns:
 *  - tq_sequence_: The overall queueing order.
 *  - tq_prev_: A pointer to the previous task.
 *  - tq_next_: A pointer to the next task.
 */
class IntrusiveTaskQueue {
  /**
   * Constructs an empty IntrusiveTaskQueue.
   */
  constructor() {
    /**
     * @private
     * @const {!Object}
     */
    this.head_ = null;

    /**
     * @private
     * @const {!Object}
     */
    this.tail_ = null;
  }

  /** @return {boolean} */
  isEmpty() {
    return this.head_ == null;
  }

  /** @param {!Object} task */
  push(task) {
    if (typeof task !== 'object') throw new TypeError('Task must be an Object');

    task.tq_sequence_ = nextSequence++;

    if (this.isEmpty()) {
      task.tq_prev_ = null;
      this.head_ = task;
    } else {
      task.tq_prev_ = this.tail_;
      this.tail_.tq_next_ = task;
    }

    task.tq_next_ = null;
    this.tail_ = task;
  }

  /** @return {?Object} The oldest task or null of the queue is empty. */
  takeNextTask() {
    if (this.isEmpty()) return null;
    const task = this.head_;
    this.remove_(task);
    return task;
  }

  /**
   * Merges all tasks from `sourceQueue` into this task queue for which
   * `selector` returns true . Tasks are insterted into this queue based on
   * their sequence number.
   *
   * @param {!IntrusiveTaskQueue} sourceQueue
   * @param {function(!Object): boolean} selector
   */
  merge(sourceQueue, selector) {
    if (typeof selector !== 'function') {
      throw new TypeError('Must provide a selector function.');
    }
    if (sourceQueue == null) throw new Error('sourceQueue cannot be null');

    let currentTask = this.head_;
    let previousTask = null;
    let iterator = sourceQueue.head_;

    while (iterator) {
      // Advance the iterator now before we mutate it and ivalidate the
      // pointers.
      const taskToMove = iterator;
      iterator = iterator.tq_next_;

      if (selector(taskToMove)) {
        sourceQueue.remove_(taskToMove);
        // Fast-forward until we're just past the insertion point. The new task
        // is inserted between previousTask and currentTask.
        while (currentTask &&
               (currentTask.tq_sequence_ < taskToMove.tq_sequence_)) {
          previousTask = currentTask;
          currentTask = currentTask.tq_next_;
        }
        this.insert_(taskToMove, previousTask);
        previousTask = taskToMove;
      }
    }
  }

  /**
   * Returns an array containing the elements of this task queue in order. This
   * is meant to be used for debugging and might be removed.
   *
   * TODO(shaseley): consider removing this.
   *
   * @return {!Array<!Object>}
   */
  toArray() {
    let node = this.head_;
    const a = [];
    while (node !== null) {
      a.push(node);
      node = node.tq_next_;
    }
    return a;
  }

  /**
   * Insert `task` into this queue directly after `parentTask`.
   * @private
   * @param {!Object} task The task to insert.
   * @param {?Object} parentTask The task preceding `task` in this queue, or
   *    null if `task` should be inserted at the beginning.
   */
  insert_(task, parentTask) {
    // We can simply push the new task if it belongs at the end.
    if (parentTask == this.tail_) {
      this.push(task);
      return;
    }

    // `nextTask` is the next task in the list, which should not be null since
    // `parentTask` is not the tail (which is the only task with a null next
    // pointer).
    const nextTask = parentTask ? parentTask.tq_next_ : this.head_;

    task.tq_next_ = nextTask;
    nextTask.tq_prev_ = task;

    task.tq_prev_ = parentTask;

    if (parentTask != null) {
      parentTask.tq_next_ = task;
    } else {
      this.head_ = task;
    }
  }

  /**
   * @private
   * @param {!Object} task
   */
  remove_(task) {
    if (task == null) throw new Error('Expected task to be non-null');
    if (task === this.head_) this.head_ = task.tq_next_;
    if (task === this.tail_) this.tail_ = this.tail_.tq_prev_;
    if (task.tq_next_) task.tq_next_.tq_prev_ = task.tq_prev_;
    if (task.tq_prev_) task.tq_prev_.tq_next_ = task.tq_next_;
  }
}

export {IntrusiveTaskQueue};
