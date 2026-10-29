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

import {HostCallback} from '../src/host-callback.js';
import {SCHEDULER_PRIORITIES} from '../src/scheduler-priorities.js';
import {Scheduler} from '../src/scheduler.js';

describe('HostCallback', function() {
  describe('MessagePort references', function() {
    let refDescriptor;
    let unrefDescriptor;
    let receiver;
    let referenced;
    let references;
    let releases;

    beforeEach(async function() {
      // Drain the shared broker before instrumenting its native receiver.
      await new Promise((resolve) => {
        new HostCallback(resolve, 'user-visible');
      });
      refDescriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype,
          'ref');
      unrefDescriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype,
          'unref');
      receiver = null;
      referenced = false;
      references = 0;
      releases = 0;
      Object.defineProperty(MessagePort.prototype, 'ref', {
        configurable: true,
        value: function() {
          receiver = this;
          referenced = true;
          references++;
        },
      });
      Object.defineProperty(MessagePort.prototype, 'unref', {
        configurable: true,
        value: function() {
          referenced = false;
          releases++;
        },
      });
    });

    afterEach(async function() {
      try {
        await new Promise((resolve) => {
          new HostCallback(resolve, 'user-visible');
        });
      } finally {
        if (refDescriptor) {
          Object.defineProperty(MessagePort.prototype, 'ref', refDescriptor);
        } else {
          delete MessagePort.prototype.ref;
        }
        if (unrefDescriptor) {
          Object.defineProperty(
              MessagePort.prototype, 'unref', unrefDescriptor);
        } else {
          delete MessagePort.prototype.unref;
        }
      }
    });

    it('should not reference a port when only constructing a scheduler',
        function() {
          new Scheduler();
          expect(references).to.equal(0);
        });

    it('should release the receiver when its last callback is dispatched',
        async function() {
          const completed = new Promise((resolve) => {
            new HostCallback(() => resolve(referenced), 'user-visible');
          });
          expect(referenced).to.equal(true);
          expect(await completed).to.equal(false);
          expect(releases).to.equal(1);
        });

    it('should release the receiver when the last callback is canceled',
        function() {
          const callback = new HostCallback(() => {
            throw new Error('Canceled callback ran');
          }, 'user-visible');
          expect(referenced).to.equal(true);
          callback.cancel();
          expect(referenced).to.equal(false);
          callback.cancel();
          expect(releases).to.equal(1);
        });

    it('should keep the receiver referenced for other pending callbacks',
        async function() {
          const canceled = new HostCallback(() => {
            throw new Error('Canceled callback ran');
          }, 'user-visible');
          const completed = new Promise((resolve) => {
            new HostCallback(() => resolve(referenced), 'user-visible');
          });
          expect(references).to.equal(1);
          canceled.cancel();
          expect(referenced).to.equal(true);
          expect(releases).to.equal(0);
          // The canceled message arrives first but must not release live work.
          expect(await completed).to.equal(false);
          expect(releases).to.equal(1);
        });

    it('should reactivate after cancellation despite stale messages',
        async function() {
          const canceled = new HostCallback(() => {
            throw new Error('Canceled callback ran');
          }, 'user-visible');
          canceled.cancel();
          const completed = new Promise((resolve) => {
            new HostCallback(() => resolve(releases), 'user-visible');
          });
          expect(referenced).to.equal(true);
          expect(await completed).to.equal(2);
          expect(referenced).to.equal(false);
        });

    it('should reactivate when a callback queues more work', async function() {
      let referencedDuringCallback;
      let referencedAfterQueueing;
      const completed = new Promise((resolve) => {
        new HostCallback(() => {
          referencedDuringCallback = referenced;
          new HostCallback(() => resolve(referenced), 'user-visible');
          referencedAfterQueueing = referenced;
        }, 'user-visible');
      });
      expect(await completed).to.equal(false);
      expect(referencedDuringCallback).to.equal(false);
      expect(referencedAfterQueueing).to.equal(true);
      expect(releases).to.equal(2);
    });

    it('should reactivate after draining', async function() {
      await new Promise((resolve) => new HostCallback(resolve, 'user-visible'));
      expect(referenced).to.equal(false);
      const completed = new Promise((resolve) => {
        new HostCallback(resolve, 'user-visible');
      });
      expect(referenced).to.equal(true);
      await completed;
      expect(referenced).to.equal(false);
      expect(releases).to.equal(2);
    });

    it('should share references between schedulers', async function() {
      const first = new Scheduler();
      const second = new Scheduler();
      const firstTask = first.postTask(() => referenced);
      const secondTask = second.postTask(() => referenced);
      expect(referenced).to.equal(true);
      const results = await Promise.all([firstTask, secondTask]);
      expect(results).to.deep.equal([true, false]);
      expect(releases).to.equal(1);
    });

    it('should release before propagating an exception', async function() {
      const callback = new HostCallback(() => {
        throw new Error('Expected callback failure');
      }, 'user-visible');
      // Dispatch synchronously to observe the exception without an uncaught
      // browser error. The native posted message will subsequently be stale.
      expect(() => receiver.onmessage(new MessageEvent('message', {
        data: callback.handle_,
      }))).to.throw('Expected callback failure');
      expect(referenced).to.equal(false);
      expect(releases).to.equal(1);
      await new Promise((resolve) => new HostCallback(resolve, 'user-visible'));
      expect(referenced).to.equal(false);
      expect(releases).to.equal(2);
    });
  });

  describe('#schedule_()', function() {
    const testConfigs = [
      {delay: 0},
      {delay: 5},
    ];

    testConfigs.forEach((test) => {
      SCHEDULER_PRIORITIES.forEach((priority) => {
        let description =
            'should schedule and run ' + priority + ' callbacks in order';
        description += test.delay > 0 ? ' (with delay)' : ' (without delay)';

        it(description, function(done) {
          let result = '';
          new HostCallback(() => {
            result += '1';
          }, priority, test.delay);
          new HostCallback(() => {
            result += '2';
          }, priority, test.delay);
          new HostCallback(() => {
            result += '3';
          }, priority, test.delay);

          new HostCallback(() => {
            expect(result).to.equal('123');
            done();
          }, priority, test.delay);
        });
      });
    });
  });

  describe('#isIdleCallback()', function() {
    it('should return true for background tasks if requestIdleCallback exists',
        function() {
          const hasRequestIdleCallback =
             typeof requestIdleCallback === 'function';
          const hostCallback = new HostCallback(() => {}, 'background');
          expect(hostCallback.isIdleCallback()).to.equal(
              hasRequestIdleCallback);
        });

    it('should return false for user-visible and user-blocking tasks',
        function() {
          let hostCallback = new HostCallback(() => {}, 'user-blocking');
          expect(hostCallback.isIdleCallback()).to.equal(false);

          hostCallback = new HostCallback(() => {}, 'user-visible');
          expect(hostCallback.isIdleCallback()).to.equal(false);
        });
  });


  describe('#isMessageChannelCallback_()', function() {
    let originalMessageChannel = null;

    beforeEach(function() {
      originalMessageChannel = window.MessageChannel;
    });

    afterEach(function() {
      window.MessageChannel = originalMessageChannel;
    });

    ['user-visible', 'user-blocking'].forEach((priority) => {
      it(`should use Message channel when avaliable for "${priority}"`,
          function() {
            const hostCallback = new HostCallback(() => {}, priority);
            expect(hostCallback.isMessageChannelCallback_()).to.equal(true);
          });

      it(`should not use Message channel when not avaliable for "${priority}"`,
          function() {
            window.MessageChannel = null;
            const hostCallback = new HostCallback(() => {}, priority);
            expect(hostCallback.isMessageChannelCallback_()).to.equal(false);
          });
    });
  });


  describe('#cancel()', function() {
    const testConfigs = [
      {delay: 0},
      {delay: 5},
    ];

    testConfigs.forEach((test) => {
      SCHEDULER_PRIORITIES.forEach((priority) => {
        let description =
            'should prevent ' + priority + ' callbacks from running';
        description += test.delay > 0 ? ' (with delay)' : ' (without delay)';

        it(description, function(done) {
          const hostCallbackToCancel = new HostCallback(() => {
            throw new Error('This callback should not run');
          }, priority, test.delay);

          new HostCallback(() => {
            done();
          }, priority, test.delay);

          hostCallbackToCancel.cancel();
        });
      });
    });
  });
});
