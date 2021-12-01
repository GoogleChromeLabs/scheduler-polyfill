# Scheduler Polyfill

This is a polyfill for the [Prioritized Task Scheduling
API](https://wicg.github.io/scheduling-apis/). Documentation on the API shape
along with examples can be found in the
[explainer](https://github.com/WICG/scheduling-apis/blob/main/explainers/prioritized-post-task.md#api-shape).

The polyfill includes implementations of `Scheduler`, exposed through
`self.scheduler`, as well as `TaskController` and `TaskPriorityChangeEvent`
classes.

The implementation uses a combination of `setTimeout`, `MessageChannel`, and
`requestIdleCallback` to implement task scheduling, falling back to `setTimeout`
when other APIs are not available.

## Requirements

A browser that supports ES6 is required for this polyfill.

## Usage

**Include via unpkg:**

```html
<script src="https://unpkg.com/scheduler-polyfill"></script>
```

**Using with npm and a bundler**:

```console
npm install scheduler-polyfill
```

```js
import 'scheduler-polyfill';
```

**Building from source:**

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
