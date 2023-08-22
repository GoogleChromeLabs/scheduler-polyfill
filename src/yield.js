/**
 * Copyright 2023 Google LLC
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
 * Returns a promise that is resolved in a new task. The resulting promise is
 * rejected if the associated signal is aborted. This uses scheduler.postTask()
 * to schedule continuations.
 *
 * @param {{signal: AbortSignal, priorty: string}} options
 * @return {!Promise<*>}
 */
function schedulerYield(options) {
  // Map scheduler priority to continuation priority. Use 'user-blocking' to get
  // similar scheduling behavior in the default case; leave 'background' alone
  // so the continuations have lower priority than non-scheduler tasks.
  const continuationPriority = (priority) => {
    return !priority || priority == 'user-visible' ?
        'user-blocking' : priority;
  };

  options = Object.assign({}, options);
  // Inheritance is not supported. Use default options instead.
  if (options.signal && options.signal == 'inherit') {
    delete options.signal;
  }
  if (options.priority && options.priority == 'inherit') {
    delete options.priority;
  }

  // The code below assumes the signal is not aborted, otherwise linking
  // wouldn't work properly.
  if (options.signal && options.signal.aborted) {
    return Promise.reject(options.signal.reason);
  }

  // Priority of the continuation, used to create the signal used for
  // scheduling.
  let priority = options.priority;
  if (!priority && options.signal && options.signal.priority) {
    priority = options.signal.priority;
  }
  priority = continuationPriority(priority);

  // To support dynamic continuation priorities and a boosted default priority,
  // we can't pass the original options directly, e.g. changing from
  // 'background' to 'user-visible' wouldn't have the right effective priority
  // ('user-blocking'). To get around this, we listen and propagate 'abort' and
  // 'prioritychange' events, adjusting the priority for the latter if
  // necessary. This stores the state required for propagating 'abort' these
  // events.
  const continuation = {
    inputSignal: options.signal,

    // `controller`'s signal is used to schedule the continuation, and it
    // propagates events from `inputSignal` to control the continuation.
    controller: new self.TaskController({priority}),

    // 'abort' event handler added to `inputSignal`, if set, to propagate abort.
    abortCallback: null,

    // 'prioritychange' event handler added to `inputSignal` to propagate
    // priority changes. Only set if `inputSignal` is a TaskSignal and a
    // fixed priority override wasn't provided.
    priorityCallback: null,

    onTaskAborted: function() {
      this.controller.abort(this.inputSignal.reason);
      this.abortCallback = null;
    },

    onPriorityChange: function() {
      this.controller.setPriority(
          continuationPriority(this.inputSignal.priority));
    },

    onTaskCompleted: function() {
      if (this.abortCallback) {
        this.inputSignal.removeEventListener('abort', this.abortCallback);
        this.abortCallback = null;
      }
      if (this.priorityCallback) {
        this.inputSignal.removeEventListener(
            'prioritychange', this.priorityCallback);
        this.priorityCallback = null;
      }
    },
  };

  // Set up 'abort' event propagation.
  if (options.signal) {
    continuation.abortCallback = () => {
      continuation.onTaskAborted();
    };
    options.signal.addEventListener('abort', continuation.abortCallback);
  }

  // Set up 'prioritychange' event propagation. This is only relevant if the
  // signal is a TaskSignal and a fixed priority wasn't provided.
  if (options.signal && options.signal.priority && !options.priority) {
    continuation.priorityCallback = () => {
      continuation.onPriorityChange();
    };
    options.signal.addEventListener(
        'prioritychange', continuation.priorityCallback);
  }

  const p = self.scheduler.postTask(
      () => {}, {signal: continuation.controller.signal});
  p.then(() => {
    continuation.onTaskCompleted();
  }).catch((e) => {
    continuation.onTaskCompleted();
    throw e;
  });
  return p;
}

export {schedulerYield};
