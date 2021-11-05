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

import {SCHEDULER_PRIORITIES} from '../src/scheduler-priorities.js';
import {TaskController, TaskPriorityChangeEvent}
  from '../src/task-controller.js';

describe('TaskController', function() {
  describe('#constructor', function() {
    it('should throw an error if the priority is not valid.', function() {
      try {
        new TaskController('unknown');
        assert.okay(false);
      } catch (e) {
        expect(e.name).to.equal('TypeError');
      }
    });
  });

  describe('#signal', function() {
    it('should default to user-visible priority', function() {
      const controller = new TaskController();
      expect(controller.signal.priority).to.equal('user-visible');
    });

    it('should match the controller priority', function() {
      SCHEDULER_PRIORITIES.forEach((priority) => {
        const controller = new TaskController({priority});
        expect(controller.signal.priority).to.equal(priority);
      });
    });

    it('should have read-only priority', function() {
      const controller = new TaskController();
      const signal = controller.signal;
      try {
        signal.priority = 'background';
        assert.ok(false);
      } catch {
        assert.ok(true);
      }
    });
  });

  describe('#setPriority', function() {
    it('should change the signal priority', function() {
      const controller = new TaskController();
      SCHEDULER_PRIORITIES.forEach((priority) => {
        controller.setPriority(priority);
        expect(controller.signal.priority).to.equal(priority);
      });
    });

    it('should raise a prioritychange event', function(done) {
      const controller = new TaskController();
      controller.signal.addEventListener('prioritychange', (e) => {
        expect(controller.signal.priority).to.equal('background');
        expect(e.previousPriority).to.equal('user-visible');
        done();
      });
      controller.setPriority('background');
    });

    it('should throw an error if the priority is not valid.', function() {
      const controller = new TaskController();
      try {
        controller.setPriority('unknown');
        assert.okay(false);
      } catch (e) {
        expect(e.name).to.equal('TypeError');
      }
    });

    it('should raise a prioritychange event when using onprioritychange',
        function(done) {
          const controller = new TaskController();
          controller.signal.onprioritychange = (e) => {
            expect(controller.signal.priority).to.equal('background');
            expect(e.previousPriority).to.equal('user-visible');
            done();
          };
          controller.setPriority('background');
        });

    it('should throw an error on recursive calls', function(done) {
      const controller = new TaskController();
      controller.signal.onprioritychange = (e) => {
        expect(controller.signal.priority).to.equal('background');
        try {
          controller.setPriority('user-blocking');
          assert.ok(false);
        } catch (e) {
          expect(e.name).to.equal('NotAllowedError');
        }
        done();
      };
      controller.setPriority('background');
    });
  });
});

describe('TaskSignal', function() {
  describe('#onprioritychange', function() {
    it('should return the handler it was set to', function() {
      [function() {}, {}].forEach((handler) => {
        const controller = new TaskController();
        const signal = controller.signal;
        controller.signal.onprioritychange = handler;
        expect(signal.onprioritychange).to.equal(handler);
      });
    });
  });
});

describe('TaskPriorityChangeEvent', function() {
  describe('#constructor', function() {
    it('should throw an error on invalid arguments', async function() {
      [
        [],
        [''],
        ['', {}],
        ['', 'init'],
        ['', {previousPriority: null}],
        ['', {previousPriority: ''}],
        ['', {previousPriority: 1}],
      ].forEach(async (args) => {
        try {
          new TaskPriorityChangeEvent(...args);
          assert.ok(false);
        } catch (e) {
          expect(e.name).to.equal('TypeError');
        }
      });
    });
  });

  describe('#previousPriority', function() {
    it('should be set to the constructor value', async function() {
      const e = new TaskPriorityChangeEvent(
          'prioritychange', {previousPriority: 'background'});
      expect(e.previousPriority).to.equal('background');
    });
  });
});
