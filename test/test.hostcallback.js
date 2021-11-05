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

describe('HostCallback', function() {
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
