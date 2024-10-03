# Scheduler Polyfill

This is a polyfill for the [Prioritized Task Scheduling
API](https://wicg.github.io/scheduling-apis/). Documentation can be found on
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler).

The polyfill includes implementations of `Scheduler`, exposed through
`self.scheduler`, as well as `TaskController` and `TaskPriorityChangeEvent`
classes.

## `scheduler.postTask()`

The implementation uses a combination of `setTimeout`, `MessageChannel`, and
`requestIdleCallback` to implement task scheduling, falling back to `setTimeout`
when other APIs are not available.

The polyfill, like the native implementation, runs `scheduler` tasks in
descending priority order (`'user-blocking'` > `'user-visible'` >
`'background'`). But there are some differences in the relative order of
non-`scheduler` tasks:

 - `"background"` tasks are scheduled using `requestIdleCallback` on browsers
   that support it, which provides similar scheduling as `scheduler`. For
   browsers that don't support it, these tasks do not have low/idle event loop
   priority.

 - `"user-blocking"` tasks have the same event loop scheduling prioritization as
   `"user-visible"` (similar to `setTimeout()`), meaning these tasks do not have
   a higher event loop priority.

## `scheduler.yield()`

The polyfill does not support [priority or signal
inheritance](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield#inheriting_task_priorities),
so all continuations are scheduled with `"user-visible"` continuation priority.
The scheduling behavior of this depends on whether the browser supports
`scheduler.postTask()` (i.e. older Chrome versions):
  * For browsers that support `scheduler.postTask()`, `scheduler.yield()` is
    polyfilled with `"user-blocking"` `scheduler.postTask()` tasks. This means
    they typically have a higher event loop priority than other tasks
    (consistent with `yield()`), but they can be interleaved with other
    `"user-blocking"` tasks.

 * On browsers that don't support `scheduler.postTask()`, the same event loop
   prioritization as the `postTask()` polyfill applies (see above), but
   continuations run between `"user-blocking"` and `"user-visible"` tasks.

## Requirements

A browser that supports ES6 is required for this polyfill.

## Usage

**TODO(shaseley)**: Update this when we figure out the versioning.

### Include via unpkg

**Use the next version of the polyfill, which includes `scheduler.yield()`:**
```html
<script src="https://unpkg.com/scheduler-polyfill@next"></script>
```

**or use the current stable release of the polyfill:**
```html
<script src="https://unpkg.com/scheduler-polyfill"></script>
```

### Include via npm and a bundler

```console
npm install scheduler-polyfill@next
```

**Or use the stable release (without `scheduler.yield()`):**

```sh
npm install scheduler-polyfill
```

Import to populate the task scheduling global variables, if not already
available in the executing browser:

```js
import 'scheduler-polyfill';
```

### Building from source

```console
git clone https://github.com/GoogleChromeLabs/scheduler-polyfill
cd scheduler-polyfill
npm i
npm test        # Tests should pass
npm run build   # Outputs minified polyfill to dist/
```

```html
<script src="/path_to_polyfill/scheduler-polyfill.js"></script>
```

## License

[Apache 2.0](LICENSE)
