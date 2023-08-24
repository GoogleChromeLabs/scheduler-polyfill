# Scheduler Polyfill

This is a polyfill for the [Prioritized Task Scheduling
API](https://wicg.github.io/scheduling-apis/). Documentation on the API shape
along with examples can be found in the
[explainer](https://github.com/WICG/scheduling-apis/blob/main/explainers/prioritized-post-task.md#api-shape).

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

> `scheduler.yield()` is available in version 1.2 of the polyfill, published
under the `next` tag on npm. See the [Usage section](#usage) for installation
instructions.

The polyfill supports [`scheduler.yield()`](https://chromestatus.com/feature/6266249336586240),
which is currently in [Origin Trial in
Chrome](https://developer.chrome.com/origintrials/#/view_trial/836543630784069633).

[Signal and priority
inheritance](https://github.com/WICG/scheduling-apis/blob/main/explainers/yield-and-continuation.md#controlling-continuation-priority-and-abort-behavior)
is not currently supported in the polyfill, and using the `"inherit"` option
will result in the default behavior, i.e. the continuation will not be aborted
and will run at default priority.

The scheduling behavior of the polyfill depends on whether the browser supports
`scheduler.postTask()` (i.e. older Chrome versions). If it does, then `yield()`
is polyfilled with `postTask()`, with the following behavior:

 - `"user-visible"` continuations run as `"user-blocking"` `scheduler` tasks.
   This means they typically have a higher event loop priority than other tasks
   (consistent with `yield()`), but they can be interleaved with other
   `"user-blocking"` tasks. The same goes for `"user-blocking"` continuations.
 - `"background"` continuations are scheduled as `"background"` tasks, which
   means they have lowered event loop priority but don't go ahead of other
   `"background"` tasks, so they can be interleaved.

On browsers that don't support `scheduler.postTask()`, the same event loop
prioritization as the `postTask()` polyfill applies (see above), but
continuations have higher priority than tasks of the same priority, e.g.
`"background"` continuations run before `"background"` tasks.

## Requirements

A browser that supports ES6 is required for this polyfill.

## Usage

### Include via unpkg

**Use the next version of the polyfill, which includes `scheduler.yield()``:**
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
