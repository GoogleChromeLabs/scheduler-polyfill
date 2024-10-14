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
 * @fileoverview This version of scheduler.yield() is only used if
 * self.scheduler is defined. It assumes that this is the native implementation
 * (i.e. running in an older browser), and it uses scheduler.postTask() to
 * schedule continuations at 'user-blocking' priority.
 */

/**
 * Returns a promise that is resolved in a new task. This schedules
 * continuations as 'user-blocking' scheduler.postTask() tasks.
 *
 * @return {!Promise<*>}
 */
function schedulerYield() {
  // Use 'user-blocking' priority to get similar scheduling behavior as
  // scheduler.yield(). Note: we can't reliably inherit priority and abort since
  // we lose context if async functions are spread across multiple tasks.
  return self.scheduler.postTask(() => {}, {priority: 'user-blocking'});
}

export {schedulerYield};
