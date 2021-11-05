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

import {IntrusiveTaskQueue} from '../src/intrusive-task-queue.js';

describe('IntrusiveTaskQueue', function() {
  describe('#isEmpty()', function() {
    it('should be true for new task queues', function() {
      const tq = new IntrusiveTaskQueue();
      expect(tq.isEmpty()).to.equal(true);
    });

    it('should be false when tasks are added', function() {
      const tq = new IntrusiveTaskQueue();
      tq.push({});
      expect(tq.isEmpty()).to.equal(false);
      tq.push({});
      expect(tq.isEmpty()).to.equal(false);
    });

    it('should be true when all tasks are removed', function() {
      const tq = new IntrusiveTaskQueue();
      const NUM_TASKS = 10;

      for (let i = 0; i < NUM_TASKS; i++) {
        tq.push({});
        expect(tq.isEmpty()).to.equal(false);
      }

      for (let i = 0; i < NUM_TASKS; i++) {
        expect(tq.isEmpty()).to.equal(false);
        tq.takeNextTask();
      }

      expect(tq.isEmpty()).to.equal(true);
    });
  });

  describe('#takeNextTask()', function() {
    it('should return null when the queue is empty', function() {
      const tq = new IntrusiveTaskQueue();
      const task = tq.takeNextTask();
      expect(task).to.equal(null);
    });

    it('should return tasks in the order they were posted', function() {
      const tq = new IntrusiveTaskQueue();
      const values = [1, 2, 3, 4, 5];

      values.forEach((v) => {
        tq.push({value: v});
      });

      const results = [];
      while (!tq.isEmpty()) {
        results.push(tq.takeNextTask().value);
      }

      expect(results.length).to.equal(values.length);

      for (let i = 0; i < results.length; i++) {
        expect(results[i]).to.equal(values[i]);
      }
    });
  });

  describe('#merge()', function() {
    it('should not fail for empty queues', function() {
      const sourceQueue = new IntrusiveTaskQueue();
      const destinationQueue = new IntrusiveTaskQueue();

      destinationQueue.merge(sourceQueue, () => true);

      expect(sourceQueue.isEmpty()).to.equal(true);
      expect(destinationQueue.isEmpty()).to.equal(true);
    });

    it('should work for an empty and non-empty queue', function() {
      const sourceQueue = new IntrusiveTaskQueue();
      const task = {};
      sourceQueue.push(task);

      const destinationQueue = new IntrusiveTaskQueue();
      destinationQueue.merge(sourceQueue, () => true);

      expect(sourceQueue.isEmpty()).to.equal(true);
      expect(destinationQueue.isEmpty()).to.equal(false);
      expect(destinationQueue.takeNextTask()).to.equal(task);
    });

    it('should place the oldest task at the front of the queue', function() {
      const sourceQueue = new IntrusiveTaskQueue();
      sourceQueue.push({id: 1});

      const destinationQueue = new IntrusiveTaskQueue();
      destinationQueue.push({id: 2});
      destinationQueue.push({id: 3});

      destinationQueue.merge(sourceQueue, () => true);

      expect(sourceQueue.isEmpty()).to.equal(true);
      expect(destinationQueue.isEmpty()).to.equal(false);

      expect(destinationQueue.takeNextTask().id).to.equal(1);
      expect(destinationQueue.takeNextTask().id).to.equal(2);
      expect(destinationQueue.takeNextTask().id).to.equal(3);

      expect(destinationQueue.isEmpty()).to.equal(true);
    });

    it('should interleave tasks in posted order', function() {
      const sourceQueue = new IntrusiveTaskQueue();
      const destinationQueue = new IntrusiveTaskQueue();

      for (let id = 0; id < 50; id++) {
        const queue = id % 2 === 0 ? sourceQueue : destinationQueue;
        queue.push({id});
      }

      destinationQueue.merge(sourceQueue, () => true);

      expect(sourceQueue.isEmpty()).to.equal(true);
      expect(destinationQueue.isEmpty()).to.equal(false);

      for (let i = 0; i < 50; i++) {
        expect(destinationQueue.takeNextTask().id).to.equal(i);
      }
      expect(destinationQueue.isEmpty()).to.equal(true);
    });

    it('should abide the selector function', function() {
      const sourceQueue = new IntrusiveTaskQueue();
      sourceQueue.push({id: 0});
      sourceQueue.push({id: 1});
      sourceQueue.push({id: 2});
      sourceQueue.push({id: 3});

      const destinationQueue = new IntrusiveTaskQueue();
      destinationQueue.push({id: 4});
      destinationQueue.push({id: 5});

      destinationQueue.merge(sourceQueue, (task) => {
        return task.id < 2;
      });

      expect(sourceQueue.takeNextTask().id).to.equal(2);
      expect(sourceQueue.takeNextTask().id).to.equal(3);
      expect(sourceQueue.isEmpty()).to.equal(true);

      expect(destinationQueue.takeNextTask().id).to.equal(0);
      expect(destinationQueue.takeNextTask().id).to.equal(1);
      expect(destinationQueue.takeNextTask().id).to.equal(4);
      expect(destinationQueue.takeNextTask().id).to.equal(5);
      expect(destinationQueue.isEmpty()).to.equal(true);
    });

    it('should properly set the previous pointer during merging', function() {
      /*
       * The previous task pointer (tq_prev_) is modified when merging a task,
       * and used for setting the next and tail pointers when removing a task
       * during merges. This tests the pointers are being set correctly by
       * moving a middle element multiple times, which will fail if tq_prev_ is
       * not set properly (i.e. setting the tq_prev_.tq_next_ will be wrong.
       */
      const sourceQueue = new IntrusiveTaskQueue();
      const destinationQueue1 = new IntrusiveTaskQueue();
      const selector = (task) => {
        return task.id === 4;
      };

      sourceQueue.push({id: 0});
      sourceQueue.push({id: 1});
      destinationQueue1.push({id: 2});
      destinationQueue1.push({id: 3});
      sourceQueue.push({id: 4});
      destinationQueue1.push({id: 5});

      destinationQueue1.merge(sourceQueue, selector);
      const destinationQueue2 = new IntrusiveTaskQueue();
      destinationQueue2.merge(destinationQueue1, selector);

      sourceQueue.push({id: 6});
      destinationQueue1.push({id: 7});
      destinationQueue2.push({id: 8});

      expect(sourceQueue.isEmpty()).to.equal(false);
      expect(sourceQueue.takeNextTask().id).to.equal(0);
      expect(sourceQueue.takeNextTask().id).to.equal(1);
      expect(sourceQueue.takeNextTask().id).to.equal(6);
      expect(sourceQueue.isEmpty()).to.equal(true);

      expect(destinationQueue1.isEmpty()).to.equal(false);
      expect(destinationQueue1.takeNextTask().id).to.equal(2);
      expect(destinationQueue1.takeNextTask().id).to.equal(3);
      expect(destinationQueue1.takeNextTask().id).to.equal(5);
      expect(destinationQueue1.takeNextTask().id).to.equal(7);
      expect(destinationQueue1.isEmpty()).to.equal(true);

      expect(destinationQueue2.isEmpty()).to.equal(false);
      expect(destinationQueue2.takeNextTask().id).to.equal(4);
      expect(destinationQueue2.takeNextTask().id).to.equal(8);
      expect(destinationQueue2.isEmpty()).to.equal(true);
    });
  });
});
