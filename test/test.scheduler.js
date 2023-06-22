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

import {Scheduler} from '../src/scheduler.js';
import {SCHEDULER_PRIORITIES} from '../src/scheduler-priorities.js';
import {TaskController} from '../src/task-controller.js';

describe('Scheduler', function() {
  describe('#postTask()', function() {
    SCHEDULER_PRIORITIES.forEach((priority) => {
      it('should run ' + priority + ' tasks', function() {
        const scheduler = new Scheduler();
        return scheduler.postTask(() => {}, {priority});
      });
    });

    SCHEDULER_PRIORITIES.forEach((priority) => {
      it('should run ' + priority + ' delayed tasks', function() {
        const scheduler = new Scheduler();
        return scheduler.postTask(() => {}, {priority, delay: 5});
      });
    });

    it('should resolve the promise with the task result', async function() {
      const scheduler = new Scheduler();
      let result = await scheduler.postTask(() => 1234);
      expect(result).to.equal(1234);

      result = await scheduler.postTask(() => 'result', {delay: 5});
      expect(result).to.equal('result');
    });

    const simplePriorityTest = {
      expectedOrder: '123',
      tasks: [
        {value: '3', priority: 'background'},
        {value: '2', priority: 'user-visible'},
        {value: '1', priority: 'user-blocking'},
      ],
    };

    const priorityOrderTests = [
      {
        useSignal: false,
        description:
            'should run tasks from highest to lowest priority (without signal)',
        ...simplePriorityTest,
      },
      {
        useSignal: true,
        description:
            'should run tasks from highest to lowest priority (with signal)',
        ...simplePriorityTest,
      },
      {
        useSignal: false,
        description:
            'should run tasks from highest to lowest priority, and posting ' +
            'order within priorities',
        expectedOrder: '123456789',
        tasks: [
          {value: '7', priority: 'background'},
          {value: '8', priority: 'background'},
          {value: '9', priority: 'background'},
          {value: '4', priority: 'user-visible'},
          {value: '5', priority: 'user-visible'},
          {value: '6', priority: 'user-visible'},
          {value: '1', priority: 'user-blocking'},
          {value: '2', priority: 'user-blocking'},
          {value: '3', priority: 'user-blocking'},
        ],
      },
    ];

    priorityOrderTests.forEach((test) => {
      it(test.description, async function() {
        const scheduler = new Scheduler();
        const promises = [];
        let result = '';

        test.tasks.forEach((task) => {
          let options;
          if (test.useSignal) {
            const controller = new TaskController({priority: task.priority});
            options = {signal: controller.signal};
          } else {
            options = {priority: task.priority};
          }
          const p = scheduler.postTask(() => {
            result += task.value;
          }, options);
          promises.push(p);
        });

        await Promise.all(promises);
        expect(result).to.equal(test.expectedOrder);
      });
    });

    it('should use priority if both priority and signal are provided',
        async function() {
          const scheduler = new Scheduler();
          const promises = [];
          let result = '';

          const controller = new TaskController({priority: 'user-blocking'});
          const signal = controller.signal;

          promises.push(scheduler.postTask(() => {
            result += '1';
          }, {signal}));
          promises.push(scheduler.postTask(() => {
            result += '2';
          }, {signal}));
          promises.push(scheduler.postTask(
              () => {
                result += '3';
              }, {signal, priority: 'background'}));
          promises.push(scheduler.postTask(() => {
            result += '4';
          }, {signal}));
          promises.push(scheduler.postTask(() => {
            result += '5';
          }, {signal}));

          await Promise.all(promises);
          expect(result).to.equal('12453');
        });

    it('should not run expired background priority delayed tasks before new ' +
        'higher priority tasks', function(done) {
      let numTasks = 0;
      const scheduler = new Scheduler();

      scheduler.postTask(() => {
        expect(numTasks).to.equal(3);
        done();
      }, {priority: 'background', delay: 2});

      // The first task will spin for > 2 ms so that the background task
      // will be expired.
      scheduler.postTask(() => {
        ++numTasks;
        const start = performance.now();
        while ((performance.now() - start) < 5)
          ;

        // Schedule a couple new tasks, both of which should run before the
        // delayed task.
        scheduler.postTask(() => {
          ++numTasks;
        });
        scheduler.postTask(() => {
          ++numTasks;
        });
      });
    });

    it('should run a combination of delayed and non-delayed tasks', function() {
      const results = [];
      const scheduler = new Scheduler();

      for (let i = 0; i < 5; i++) {
        SCHEDULER_PRIORITIES.forEach((priority) => {
          results.push(scheduler.postTask(() => {}, {priority}));
          results.push(scheduler.postTask(() => {}, {priority, delay: 5}));
        });
      }
      return Promise.all(results);
    });

    it('should reject tasks posted with an aborted signal', function(done) {
      const controller = new TaskController();
      controller.abort();
      const signal = controller.signal;

      const scheduler = new Scheduler();
      scheduler.postTask(() => {}, {signal})
          .then(() => {
            assert.ok(false);
          })
          .catch(() => {
            assert.ok(true);
            done();
          });
    });

    const baseAbortTest = {
      tasks: [
        {value: '1', abort: false}, {value: '2', abort: true},
        {value: '3', abort: false}, {value: '4', abort: true},
        {value: '5', abort: false},
      ],
      expectedOrder: '135',
    };

    const abortTests = [
      {delay: 0, description: 'should not run aborted tasks', ...baseAbortTest},
      {
        delay: 5,
        description: 'should not run aborted tasks (with delay)',
        ...baseAbortTest,
      },
    ];

    abortTests.forEach((test) => {
      it(test.description, async function() {
        let result = '';
        const promises = [];
        const scheduler = new Scheduler();
        const controller = new TaskController();
        const signal = controller.signal;

        test.tasks.forEach((task) => {
          const options = {
            delay: task.delay,
            signal: task.abort ? signal : undefined,
          };

          const p = scheduler.postTask(() => {
            result += task.value;
          }, options);
          p.then(() => {
            assert.ok(!task.abort);
          }).catch(() => {
            assert.ok(task.abort);
          });

          promises.push(p);
        });

        controller.abort();
        await Promise.allSettled(promises);
        expect(result).to.equal(test.expectedOrder);
      });
    });

    // Tasks with undefined priority will use a TaskController with
    // initialPriority that changes the priority to priorityToChangeTo.
    const priorityTests = [
      {
        initialPriority: 'background',
        priorityToChangeTo: 'user-blocking',
        description: 'should properly reorder tasks when priority changes (1)',
        delay: 0,
        tasks: [
          {value: '1', priority: 'user-visible'},
          {value: '2', priority: 'user-visible'},
          {value: '3'},
          {value: '4', priority: 'user-visible'},
          {value: '5', priority: 'user-visible'},
        ],
        expectedOrder: '31245',
      },
      {
        initialPriority: 'user-blocking',
        priorityToChangeTo: 'background',
        description: 'should properly reorder tasks when priority changes (2)',
        delay: 0,
        tasks: [
          {value: '1'},
          {value: '2'},
          {value: '3', priority: 'user-visible'},
          {value: '4', priority: 'user-visible'},
          {value: '5', priority: 'user-visible'},
        ],
        expectedOrder: '34512',
      },
      // Note: This tests that tasks are inserted into the corresponding task
      // queue based on the order they were posted. This behavior has not yet
      // been specc'ed, but it matches Chromium's current postTask
      // implementation.
      {
        initialPriority: 'background',
        priorityToChangeTo: 'user-visible',
        description:
            'should reorder tasks when priority changes and use posting order',
        delay: 0,
        tasks: [
          {value: '1', priority: 'user-visible'},
          {value: '2', priority: 'user-visible'},
          {value: '3'},
          {value: '4', priority: 'user-visible'},
          {value: '5', priority: 'user-visible'},
        ],
        expectedOrder: '12345',
      },
    ];

    priorityTests.forEach((test) => {
      it(test.description, async function() {
        let result = '';
        const promises = [];
        const scheduler = new Scheduler();
        const controller = new TaskController({priority: test.initialPriority});
        const signal = controller.signal;

        test.tasks.forEach((task) => {
          const options = {
            delay: task.delay,
            priority: task.priority,
            signal: task.priority ? undefined : signal,
          };

          const p = scheduler.postTask(() => {
            result += task.value;
          }, options);
          promises.push(p);
        });

        controller.setPriority(test.priorityToChangeTo);
        await Promise.all(promises);
        expect(result).to.equal(test.expectedOrder);
      });
    });
  });

  it('should convert strings to numbers for postTask delay.', async function() {
    const scheduler = new Scheduler();
    const result = await scheduler.postTask(() => 'result', {delay: '1'});
    expect(result).to.equal('result');
  });

  it('should throw an error if postTask delay is negative.', async function() {
    const scheduler = new Scheduler();
    try {
      await scheduler.postTask(() => {}, {delay: -1});
      assert.okay(false);
    } catch (e) {
      expect(e.name).to.equal('TypeError');
    }
  });

  it('should throw an error if the priority is not valid.', async function() {
    const scheduler = new Scheduler();
    const priorities = [null, 'unknown', 1];
    priorities.forEach(async (priority) => {
      try {
        await scheduler.postTask(() => {}, {priority});
        assert.okay(false);
      } catch (e) {
        expect(e.name).to.equal('TypeError');
      }
    });
  });

  it('should throw an error if the signal is not valid.', async function() {
    const scheduler = new Scheduler();
    const signals = [
      null,
      {},
      {aborted: false},
      {addEventListener: function(e) {}},
      {addEventListener: '', aborted: true},
    ];
    signals.forEach(async (signal) => {
      try {
        await scheduler.postTask(() => {}, {signal});
        assert.okay(false);
      } catch (e) {
        expect(e.name).to.equal('TypeError');
      }
    });
  });

  it('should use the abort reason.', async function() {
    const scheduler = new Scheduler();
    let controller = new TaskController();
    controller.abort(100);
    try {
      await scheduler.postTask(() => {}, {signal: controller.signal});
      assert.okay(false);
    } catch (e) {
      expect(e).to.equal(100);
    }

    controller = new TaskController();
    const p = scheduler.postTask(() => {}, {signal: controller.signal});
    controller.abort(200);
    try {
      await p;
      assert.okay(false);
    } catch (e) {
      expect(e).to.equal(200);
    }
  });
});
