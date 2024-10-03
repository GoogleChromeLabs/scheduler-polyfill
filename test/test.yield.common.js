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
 * Tests that should work with either yield() polyfill.
 *
 * @param {!Object} scheduler
 * @param {!Object} ControllerInterface
 * @param {boolean} hasPostTask
 *
 */
function yieldCommonTests(scheduler, ControllerInterface, hasPostTask) {
  it('should run continuations.', function() {
    return scheduler.yield();
  });

  it('should run continuations in an async yieldy task.', async function() {
    for (let i = 0; i < 5; i++) {
      await scheduler.yield();
    }
  });

  it('it should run continuations in queue order.', async function() {
    const tasks = [];
    let result = '';
    // Post continuations in a way that the tasks all start before the
    // continuations run, with either version of yield().
    for (let i = 0; i < 3; i++) {
      const task = scheduler.postTask(async () => {
        await scheduler.yield();
        result += i;
      });
      tasks.push(task);
    }
    await Promise.all(tasks);
    expect(result).to.equal('012');
  });

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

  it('should not abort scheduled continuations.', async function() {
    // The polyfill doesn't support inheritance, so the yield promise won't be
    // rejected.
    const controller = new ControllerInterface();
    scheduler.postTask(async () => {
      const p = scheduler.yield();
      controller.abort('abort reason');
      try {
        await p;
      } catch (e) {
        assert.ok(false);
      }
    }, {signal: controller.signal}).catch(() => {});
  });

  // Priority tests.
  it('should run continutions in the expected order', async function() {
    const tasks = [];
    let result = '';

    [
      {priority: 'background', id: 'bg'},
      {priority: 'user-visible', id: 'uv'},
      {priority: 'user-blocking', id: 'ub'},
    ].forEach(({priority, id}) => {
      // Schedule a task with the given priority.
      tasks.push(scheduler.postTask(() => {
        result += id + ', ';
      }, {priority}));
      // ...and a continuation with default priority.
      tasks.push(scheduler.yield().then(() => {
        result += 'uv-c, ';
      }));
    });

    await Promise.all(tasks);
    const expected = hasPostTask ?
        'uv-c, uv-c, ub, uv-c, uv, bg, ' :
        'ub, uv-c, uv-c, uv-c, uv, bg, ';
    expect(result).to.equal(expected);
  });
}

export {yieldCommonTests};
