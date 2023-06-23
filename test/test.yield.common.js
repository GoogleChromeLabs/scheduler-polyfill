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

import {SCHEDULER_PRIORITIES} from '../src/scheduler-priorities.js';

/**
 * Tests that should work with either yield() polyfill.
 *
 * @param {!Object} scheduler
 * @param {!Object} ControllerInterface
 * @param {boolean} hasPostTask
 *
 */
function yieldCommonTests(scheduler, ControllerInterface, hasPostTask) {
  SCHEDULER_PRIORITIES.forEach((priority) => {
    it('should run ' + priority + ' continuations.', function() {
      return scheduler.yield({priority});
    });
  });

  SCHEDULER_PRIORITIES.forEach((priority) => {
    it('should run ' + priority + ' continuations using a signal.', function() {
      const controller = new ControllerInterface();
      return scheduler.yield({signal: controller.signal});
    });
  });

  SCHEDULER_PRIORITIES.forEach((priority) => {
    it('should run ' + priority + ' continuations in an async yieldy task.',
        async function() {
          for (let i = 0; i < 5; i++) {
            await scheduler.yield({priority});
          }
        });
  });

  it('it should run continuations in queue order.', async function() {
    const tasks = [];
    let result = '';
    // Post continuations in a way that the tasks all start before the
    // continuations run, with either version of yield().
    for (let i = 0; i < 3; i++) {
      const task = scheduler.postTask(async () => {
        await scheduler.yield({priority: 'background'});
        result += i;
      });
      tasks.push(task);
    }
    await Promise.all(tasks);
    expect(result).to.equal('012');
  });

  // Note: this is the only priority guaranteed to have this property in both
  // polyfills.
  it('it should run user-visible continuations before tasks', async () => {
    let result = '';
    await scheduler.postTask(async () => {
      const p = scheduler.postTask(() => {
        result += 'task';
      });
      await scheduler.yield();
      result += 'continuation ';
      await p;
    });
    expect(result).to.equal('continuation task');
  });

  it('should not fail with {priority: "inherit"}.', function() {
    return scheduler.yield({priority: 'inherit'});
  });

  it('should not fail with {signal: "inherit"}.', function() {
    return scheduler.yield({signal: 'inherit'});
  });

  it('should abort scheduled continuations.', async function() {
    const controller = new ControllerInterface();
    const p = scheduler.yield({signal: controller.signal});
    controller.abort('abort reason');
    try {
      await p;
      assert.ok(false);
    } catch (e) {
      expect(e).to.equal('abort reason');
    }

    // Same if passing an aborted signal.
    try {
      await scheduler.yield({signal: controller.signal});
      assert.ok(false);
    } catch (e) {
      expect(e).to.equal('abort reason');
    }
  });

  it('should observe priority changes.', async function() {
    const controller = new ControllerInterface();
    const signal = controller.signal;
    let result = '';
    await scheduler.postTask(async () => {
      // user-visible continuations are guaranteed to run before user-visible
      // tasks in both versions, so this test will fail if the priority change
      // isn't observed.
      const task = scheduler.postTask(() => {
        result += 'task ';
      });

      // This will run before the user-visible continuation in the
      // schedulerYield polyfill because it gets queued first.
      scheduler.postTask(() => {
        controller.setPriority('background');
      }, {priority: 'user-blocking'});

      await scheduler.yield({signal});
      result += 'continuation';

      await task;
    });
    expect(result).to.equal('task continuation');
  });

  // Priority tests.
  for (let i = 0; i < 2; i++) {
    const useSignal = i == 1;
    const description = 'should run continutions in the expected order ' +
        useSignal ? '(with signal).' : '(without signal).';
    it(description, async function() {
      const tasks = [];
      let result = '';

      [
        {priority: 'background', id: 'bg'},
        {priority: 'user-visible', id: 'uv'},
        {priority: 'user-blocking', id: 'ub'},
      ].forEach(({priority, id}) => {
        const options = useSignal ?
          {signal: (new ControllerInterface({priority})).signal} :
          {priority};
        // Schedule a task with the given priority.
        tasks.push(scheduler.postTask(() => {
          result += id + ', ';
        }, options));
        // ...and a continuation.
        tasks.push(scheduler.yield(options).then(() => {
          result += id + '-c, ';
        }));
      });

      await Promise.all(tasks);
      const expected = hasPostTask ?
          'uv-c, ub, ub-c, uv, bg, bg-c, ' :
          'ub-c, ub, uv-c, uv, bg-c, bg, ';
      expect(result).to.equal(expected);
    });
  }
}

export {yieldCommonTests};
