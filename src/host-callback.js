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

import {SCHEDULER_PRIORITIES} from './scheduler-priorities.js';

/**
 * This class manages scheduling and running callbacks using postMessage.
 * @private
 */
class PostMessageCallbackMananger {
  /**
   * Construct a PostMessageCallbackMananger, which handles scheduling
   * and running callbacks via a MessageChannel.
   */
  constructor() {
    /**
     * @private
     * @const {!MessageChannel}
     */
    this.channel_ = new MessageChannel();

    /**
     * @private
     * @const {MessagePort}
     */
    this.sendPort_ = this.channel_.port2;

    /**
     * @private
     * @const {!Object<number, function(): undefined>}
     */
    this.messages_ = {};

    /**
     * @private
     * @type {number}
     */
    this.nextMessageHandle_ = 1;

    this.channel_.port1.onmessage = (e) => this.onMessageReceived_(e);
  }

  /**
   * @param {function(): undefined} callback
   * @return {number} A handle that can used for cancellation.
   */
  queueCallback(callback) {
    // We support multiple pending postMessage callbacks by associating a handle
    // with each message, which is used to look up the callback when the message
    // is received.
    const handle = this.nextMessageHandle_++;
    this.messages_[handle] = callback;
    this.sendPort_.postMessage(handle);
    return handle;
  }

  /**
   * @param {number} handle The handle returned when the callback was queued.
   */
  cancelCallback(handle) {
    delete this.messages_[handle];
  }

  /**
   * The onmessage handler, invoked when the postMessage runs.
   * @private
   * @param {!Event} e
   */
  onMessageReceived_(e) {
    const handle = e.data;
    // The handle will have been removed if the callback was canceled.
    if (!(handle in this.messages_)) return;
    const callback = this.messages_[handle];
    delete this.messages_[handle];
    callback();
  }
}

/**
 * Get the lazily initialized instance of PostMessageCallbackMananger, which
 * is initialized that way to avoid errors if MessageChannel is not available.
 *
 * @return {!PostMessageCallbackMananger}
 */
function getPostMessageCallbackManager() {
  if (!getPostMessageCallbackManager.instance_) {
    getPostMessageCallbackManager.instance_ = new PostMessageCallbackMananger();
  }
  return getPostMessageCallbackManager.instance_;
}

/** @enum {number} */
const CallbackType = {
  REQUEST_IDLE_CALLBACK: 0,
  SET_TIMEOUT: 1,
  POST_MESSAGE: 2,
};

/**
 * HostCallback is used for tracking host callbacks, both for the schedueler
 * entrypoint --- which can be a postMessage, setTimeout, or
 * requestIdleCallback --- and for delayed tasks.
 */
class HostCallback {
  /**
   * @param {function(): undefined} callback
   * @param {?string} priority The scheduler priority of the associated host
   *     callback. This is used to determine which type of underlying API to
   *     use. This can be null if delay is set.
   * @param {number} delay An optional delay. Tasks with a delay will
   *     ignore the `priority` parameter and use setTimeout.
   */
  constructor(callback, priority, delay = 0) {
    /** @const {function(): undefined} */
    this.callback_ = callback;

    /**
     * @private
     * @type {CallbackType}
     */
    this.callbackType_ = null;

    /**
     * Handle for cancellation, which is set when the callback is scheduled.
     * @private
     * @type {?number}
     */
    this.handle_ = null;

    /**
     * @private
     * @type {boolean}
     */
    this.canceled_ = false;

    this.schedule_(priority, delay);
  }

  /**
   * Returns true iff this task was scheduled with requestIdleCallback.
   * @return {boolean}
   */
  isIdleCallback() {
    return this.callbackType_ === CallbackType.REQUEST_IDLE_CALLBACK;
  }

  /**
   * Returns true iff this task was scheduled with MessageChannel.
   * @return {boolean}
   */
  isMessageChannelCallback() {
    return this.callbackType_ === CallbackType.POST_MESSAGE;
  }

  /**
   * Cancel the host callback, and if possible, cancel the underlying API call.
   */
  cancel() {
    if (this.canceled_) return;
    this.canceled_ = true;

    switch (this.callbackType_) {
      case CallbackType.REQUEST_IDLE_CALLBACK:
        cancelIdleCallback(this.handle_);
        break;
      case CallbackType.SET_TIMEOUT:
        clearTimeout(this.handle_);
        break;
      case CallbackType.POST_MESSAGE:
        getPostMessageCallbackManager().cancelCallback(this.handle_);
        break;
      default:
        throw new TypeError('Unknown CallbackType');
    }
  }

  /**
   * @private
   * @param {?string} priority The scheduler priority of the associated host
   *     callback. This is used to determine which type of underlying API to
   *     use. This can be null if delay is set.
   * @param {number} delay An optional delay. Tasks with a delay will
   *     ignore the `priority` parameter and use setTimeout.
   */
  schedule_(priority, delay) {
    // For the delay case, our only option is setTimeout. This gets queued at
    // the appropriate priority when the callback runs. If the delay <= 0 and
    // MessageChannel is available, we use postMessage below.
    if (delay && delay > 0) {
      this.callbackType_ = CallbackType.SET_TIMEOUT;
      this.handle_ = setTimeout(() => {
        this.runCallback_();
      }, delay);
      return;
    }

    // This shouldn't happen since Scheduler checks the priority before creating
    // a HostCallback, but fail loudly in case it does.
    if (!SCHEDULER_PRIORITIES.includes(priority)) {
      throw new TypeError(`Invalid task priority : ${priority}`);
    }

    if (priority === 'background' &&
        typeof requestIdleCallback === 'function') {
      this.callbackType_ = CallbackType.REQUEST_IDLE_CALLBACK;
      this.handle_ = requestIdleCallback(() => {
        this.runCallback_();
      });
      return;
    }

    // Use MessageChannel if avaliable
    if (typeof MessageChannel === 'function') {
      this.callbackType_ = CallbackType.POST_MESSAGE;
      // TODO: Consider using setTimeout in the background so tasks are
      // throttled. One caveat here is that requestIdleCallback may not be
      // throttled.
      this.handle_ = getPostMessageCallbackManager().queueCallback(() => {
        this.runCallback_();
      });
      return;
    }

    // Some JS environments may not support MessageChannel.
    // This makes setTimeout the only option.
    this.callbackType_ = CallbackType.SET_TIMEOUT;
    this.handle_ = setTimeout(() => {
      this.runCallback_();
    }, delay);
  }

  /** Run the associated callback. */
  runCallback_() {
    if (this.canceled_) return;
    this.callback_();
  }
}

export {HostCallback};
