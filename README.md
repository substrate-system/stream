# @substrate-system/stream
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/stream/nodejs.yml?style=flat-square)](https://github.com/substrate-system/stream/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/stream?style=flat-square)](https://www.npmjs.com/package/@substrate-system/stream)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/stream)](https://packagephobia.com/result?p=@substrate-system/stream)
[![gzip size](https://flat.badgen.net/bundlephobia/minzip/@substrate-system/stream)](https://bundlephobia.com/package/@substrate-system/stream)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg?style=flat-square)](package.json)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


Use the native browser
[streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API),
but with a nicer wrapper.

[See a live demo](https://substrate-system.github.io/stream/)

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Examples](#examples)
  * [Simple Transform Chain](#simple-transform-chain)
  * [S Example](#s-example)
  * [Text Processing](#text-processing)
  * [JSON Processing](#json-processing)
  * [File Processing with Flush](#file-processing-with-flush)
- [API](#api)
  * [from](#from)
  * [Stream](#stream)
  * [S API](#s-api)
    + [S.from](#sfrom)
    + [Transform Methods](#transform-methods)
    + [Terminal Methods](#terminal-methods)
    + [Utility](#utility)
    + [Example](#example)
  * [through](#through)
  * [transform](#transform)
  * [filter](#filter)
  * [collect](#collect)
  * [run](#run)
- [Comparison with native `TransformStream` API](#comparison-with-native-transformstream-api)
  * [Native API](#native-api)
  * [`@substrate-system/stream` API](#substrate-systemstream-api)
- [Advanced: Custom Transformer](#advanced-custom-transformer)
- [Real-World Example](#real-world-example)
- [Backpressure Example](#backpressure-example)
- [Modules](#modules)
  * [ESM](#esm)
  * [Common JS](#common-js)
  * [pre-built JS](#pre-built-js)
    + [copy](#copy)
    + [HTML](#html)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/stream
```

## Examples

### Simple Transform Chain

```ts
import { from, through, collect } from '@substrate-system/stream';

// Create a pipeline that transforms numbers
const pipeline = from([1, 2, 3, 4, 5])
  .pipe(through(x => x * 2))           // double each number
  .pipe(through(x => x + 1))           // add 1
  .pipe(through(x => `Number: ${x}`)); // convert to string

const result = await collect(pipeline);

console.log(result);
// ['Number: 3', 'Number: 5', 'Number: 7', 'Number: 9', 'Number: 11']
```

### S Example

Create a stream with chainable methods like an Array. This is effectively an
array that consumes time instead of space.

```ts
import { S } from '@substrate-system/stream'

const result = await S.from([1, 2, 3, 4, 5, 6])
  .filter(x => x % 2 === 0)  // keep evens: [2, 4, 6]
  .map(x => x * 10)          // multiply: [20, 40, 60]
  .toArray()
// => [20, 40, 60]

// Running totals with scan
const totals = await S.from([1, 2, 3, 4])
  .scan((acc, x) => acc + x, 0)
  .toArray()
// => [1, 3, 6, 10]
```

### Text Processing

```ts
import { Stream, through } from '@substrate-system/stream';

// Fetch and process text line by line
const response = await fetch('data.txt');

const pipeline = Stream(response.body.pipeThrough(new TextDecoderStream()))
  .pipe(through(text => text.split('\n')))
  .pipe(through(lines => lines.map(line => line.trim())))
  .pipe(through(lines => lines.map(line => line.toUpperCase())));

await pipeline.pipeTo(new WritableStream({
  write(lines) {
    lines.forEach(line => console.log(line));
  }
}));
```

### JSON Processing

```typescript
import { from, through, transform, collect } from '@substrate-system/stream';

const users = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 }
];

// Filter adults and extract names
const filterAdults = transform<typeof users[0], string>({
  transform(user, controller) {
    if (user.age >= 30) {
      controller.enqueue(user.name);
    }
  }
});

const pipeline = from(users).pipe(filterAdults);

const adults = await collect(pipeline);
console.log(adults);
// ['Alice', 'Charlie']
```

### File Processing with Flush

The `through` function takes a second callback, or "flush" function, that gets
called once when the stream ends. The callback takes any remainig items,
ie, any items at the end that do not fill a complete batch.

```ts
import { through, from, collect } from '@substrate-system/stream';

// Batch processing with flush
let batch:string[] = [];

const batcher = through<string, string[]>(
  (item) => {
    batch.push(item);
    if (batch.length >= 3) {
      const result = [...batch];
      batch = [];
      return result;
    }
    return []; // Don't emit yet
  },
  () => {
    // Flush remaining items
    if (batch.length > 0) {
      console.log('Flushing remaining:', batch);
    }
  }
);

const pipeline = from(['a', 'b', 'c', 'd', 'e']).pipe(batcher);
const batches = await collect(pipeline);
```

## API

### from

Create a readable stream from an array or iterable (sync or async).

```ts
function from<T> (iterable:Iterable<T>|AsyncIterable<T>):PipeableStream<T, never>
```

```ts
import { from, collect } from '@substrate-system/stream';

const pipeline = from([1, 2, 3, 4, 5]);
const result = await collect(pipeline);
// [1, 2, 3, 4, 5]

// Also works with async iterables
async function* generator() {
  yield 1;
  yield 2;
  yield 3;
}

const asyncPipeline = from(generator());
const asyncResult = await collect(asyncPipeline);
// [1, 2, 3]
```

### Stream

Take a native `ReadableStream` and wrap it in our API.

* Add a `.pipe` method

```ts
function Stream<R> (readable:ReadableStream<R>):PipeableStream<R, never>
```

```ts
import { Stream, through, collect } from '@substrate-system/stream';

const response = await fetch('data.txt');
const pipeline = Stream(response.body)
  .pipe(through(chunk => new TextDecoder().decode(chunk)));

const result = await collect(pipeline);
```

### S API

Wrap a `ReadableStream` with chainable array-like methods. This provides a
fluent API similar to JavaScript arrays, but for streams.


```ts
function S<T> (readable:ReadableStream<T>):EnhancedStream<T>
```

#### Transform Methods

These methods return an `EnhancedStream` and can be chained:

| Method | Description |
|--------|-------------|
| `map(fn)` | Transform each chunk |
| `filter(predicate)` | Filter chunks based on a predicate |
| `forEach(fn)` | Execute side effects (pass-through) |
| `take(n)` | Take the first N chunks |
| `skip(n)` | Skip the first N chunks |
| `scan(fn, initial)` | Like reduce, but emits each intermediate value |


#### S.from

Create an `EnhancedStream` directly from an array or iterable:

```ts
S.from<T>(iterable:Iterable<T>|AsyncIterable<T>):EnhancedStream<T>
```

```ts
// Instead of: S(from([1, 2, 3]).readable)
// You can use:
const result = await S.from([1, 2, 3])
  .filter(x => x > 1)
  .map(x => x * 2)
  .toArray();
// [4, 6]

// Works with async iterables too
async function* generate() {
  yield 1;
  yield 2;
  yield 3;
}

const asyncResult = await S.from(generate())
  .map(x => x * 10)
  .toArray();
// [10, 20, 30]
```

#### scan

Like `reduce`, but emits each intermediate accumulated value instead of only
the final result. Useful for running totals, state machines, or any case where
you need to see intermediate states.

```ts
scan<U>(fn:(acc:U, item:T) => U|Promise<U>, initial:U):EnhancedStream<U>
```

```ts
// Running totals
const totals = await S.from([1, 2, 3, 4])
  .scan((acc, x) => acc + x, 0)
  .toArray();
// [1, 3, 6, 10]
// Step by step: 0+1=1, 1+2=3, 3+3=6, 6+4=10

// With different initial value
const fromTen = await S.from([1, 2, 3])
  .scan((acc, x) => acc + x, 10)
  .toArray();
// [11, 13, 16]

// Building up an array
const accumulated = await S.from(['a', 'b', 'c'])
  .scan((acc, x) => [...acc, x], [] as string[])
  .toArray();
// [['a'], ['a', 'b'], ['a', 'b', 'c']]

// Can be chained with other methods
const filtered = await S.from([1, 2, 3, 4, 5])
  .scan((acc, x) => acc + x, 0)
  .filter(x => x > 5)
  .toArray();
// [6, 10, 15]
```


#### Terminal Methods

These methods consume the stream and return a `Promise`:

| Method | Description |
|--------|-------------|
| `reduce(fn, initial)` | Reduce to a single value |
| `find(predicate)` | Find first matching chunk |
| `some(predicate)` | Check if any chunk matches |
| `every(predicate)` | Check if all chunks match |
| `toArray()` | Collect all chunks into an array |

#### Utility

| Property/Method | Description |
|-----------------|-------------|
| `readable` | Access the underlying `ReadableStream` |
| `toPipeableStream()` | Convert back to a `PipeableStream` |

#### Example

```ts
import { S, from } from '@substrate-system/stream';

// Chain operations like array methods
const result = await S(from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).readable)
  .skip(2)                    // skip first 2: [3, 4, 5, 6, 7, 8, 9, 10]
  .filter(x => x % 2 === 0)   // keep evens: [4, 6, 8, 10]
  .map(x => x * 2)            // double: [8, 12, 16, 20]
  .take(3)                    // first 3: [8, 12, 16]
  .toArray();

console.log(result);
// [8, 12, 16]

// Terminal methods
const sum = await S(from([1, 2, 3, 4]).readable)
  .reduce((acc, x) => acc + x, 0);
// 10

const found = await S(from([1, 2, 3, 4, 5]).readable)
  .find(x => x > 3);
// 4

const hasEven = await S(from([1, 3, 5, 6]).readable)
  .some(x => x % 2 === 0);
// true

const allPositive = await S(from([1, 2, 3]).readable)
  .every(x => x > 0);
// true

// scan - like reduce but emits intermediate values
const runningTotals = await S.from([1, 2, 3])
  .scan((acc, x) => acc + x, 0)
  .toArray();
// [1, 3, 6]

const withInitial = await S.from([1, 2, 3])
  .scan((acc, x) => acc + x, 10)
  .toArray();
// [11, 13, 16]
```

### through

Create a simple transform that applies a function to each chunk.

```ts
function through<I, O> (
    transformFn:(chunk:I)=>O|Promise<O>,
    flushFn?:()=>void|Promise<void>
):PipeableStream<O, I>
```

```ts
import { from, through, collect } from '@substrate-system/stream';

const pipeline = from([1, 2, 3])
  .pipe(through(x => x * 2))
  .pipe(through(x => x + 1));

const result = await collect(pipeline);
// [3, 5, 7]

// Optional flush callback runs when stream closes
const withFlush = through(
  (x) => x * 2,
  () => console.log('Stream finished!')
);
```

### transform

Create a custom transform with full control over the `TransformStream` API.

```ts
function transform<I, O> (transformer:Transformer<I, O>):PipeableStream<O, I>
```

```ts
import { from, transform, collect } from '@substrate-system/stream';

// One-to-many: emit multiple values per input
const splitter = transform<string, string>({
  transform(chunk, controller) {
    for (const char of chunk) {
      controller.enqueue(char);
    }
  }
});

const pipeline = from(['hello', 'world']).pipe(splitter);
const result = await collect(pipeline);
// ['h', 'e', 'l', 'l', 'o', 'w', 'o', 'r', 'l', 'd']

// With flush callback
const withFlush = transform<number, number>({
  transform(chunk, controller) {
    controller.enqueue(chunk * 2);
  },
  flush(controller) {
    controller.enqueue(999); // Emit final value
  }
});
```

### filter

Filter stream values based on a predicate function.

```ts
function filter<T> (
  predicate:(item:T) => boolean|Promise<boolean>
):PipeableStream<T, T>
```

```ts
import { from, filter, collect } from '@substrate-system/stream';

const pipeline = from([1, 2, 3, 4, 5])
  .pipe(filter(x => x > 2));

const result = await collect(pipeline);
// [3, 4, 5]

// Async predicates work too
const asyncFilter = filter(async (x: number) => {
  const shouldKeep = await someAsyncCheck(x);
  return shouldKeep;
});
```

### collect

Collect all values from a stream into an array.

```ts
function collect<T> (stream:PipeableStream<T, any>):Promise<T[]>
```

```ts
import { from, through, collect } from '@substrate-system/stream';

const pipeline = from([1, 2, 3])
  .pipe(through(x => x * 2));

const result = await collect(pipeline);
// [2, 4, 6]
```

### run

Execute a stream pipeline without collecting results (for side effects only).

```ts
function run<T> (stream:PipeableStream<T, any>):Promise<void>
```

```ts
import { from, through, run } from '@substrate-system/stream';

const pipeline = from([1, 2, 3])
  .pipe(through(x => {
    console.log(x);
    return x;
  }));

await run(pipeline);
// Logs: 1, 2, 3
// Returns: void
```

## Comparison with native `TransformStream` API

### Native API

```ts
// Native TransformStream API
const response = await fetch('data.json');

const decoder = new TextDecoderStream();
const parseJson = new TransformStream({
  transform(chunk, controller) {
    try {
      const parsed = JSON.parse(chunk);
      controller.enqueue(parsed);
    } catch (e) {
      controller.error(e);
    }
  }
});

const filterTransform = new TransformStream({
  transform(chunk, controller) {
    if (chunk.active) {
      controller.enqueue(chunk);
    }
  }
});

// pipe
const stream1 = response.body.pipeThrough(decoder);
const stream2 = stream1.pipeThrough(parseJson);
const stream3 = stream2.pipeThrough(filterTransform);

const reader = stream3.getReader();
const results = [];
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  results.push(value);
}
```

### `@substrate-system/stream` API

```ts
import { Stream } from '@substrate-system/stream'

// pipe
const response = await fetch('data.json');

const pipeline = Stream(response.body)
  .pipe(through(chunk => new TextDecoder().decode(chunk)))  // buffer to string
  .pipe(through(text => JSON.parse(text)))  // string to object
  .pipe(through(obj => obj.active ? obj : null));  // filter based on .active

const results = await collect(pipeline);
```

## Advanced: Custom Transformer

If you need more control (e.g., emitting multiple values per input),
use the full `transform()` with a Transformer object:

```ts
import { transform, from, collect } from '@substrate-system/stream';

// Split each string into individual characters
const splitter = transform<string, string>({
  transform(chunk, controller) {
    for (const char of chunk) {
      controller.enqueue(char);
    }
  }
});

const pipeline = from(['hello', 'world']).pipe(splitter);
const chars = await collect(pipeline);

console.log(chars);
// ['h', 'e', 'l', 'l', 'o', 'w', 'o', 'r', 'l', 'd']
```

## Real-World Example

Process large CSV data.

```ts
import { Stream, through, transform } from '@substrate-system/stream';

const response = await fetch('large-data.csv');

interface CSVRow {
  id:number;
  name:string;
  value:number;
}

// Note: This is a simplified CSV parser for demonstration.
const pipeline = Stream(response.body)
  .pipe(through(chunk => new TextDecoder().decode(chunk)))  // to string
  .pipe(through(text => text.split('\n')))  // split each line
  .pipe(transform<string, CSVRow>({
    transform(line, controller) {
      const [id, name, value] = line.split(',');
      const row = { id: parseInt(id), name, value: parseFloat(value) };
      if (row.value > 100) {
        controller.enqueue(row);
      }
    }
  }))
  .pipe(through(row => JSON.stringify(row)));  // to string again

await pipeline.pipeTo(new WritableStream({
  write(json) {
    console.log(json);
    // or send to another API, write to IndexedDB, etc.
  }
}));
```

## Backpressure Example

```ts
import { from, through } from '@substrate-system/stream';

// Slow processor - backpressure will prevent memory buildup
const slowProcessor = through(async (x:number) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return x * 2;
});

const pipeline = from(Array.from({ length: 1000 }, (_, i) => i))
  .pipe(slowProcessor)
  .pipe(through(x => x + 1));

// This will process at the rate of the slowest transform
await pipeline.pipeTo(new WritableStream({
  write(chunk) {
    console.log(chunk);
  }
}));
```

## Modules

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import {
    from,
    through,
    collect,
    Stream,
    S,
    transform,
    filter,
    run
} from '@substrate-system/stream'
```

### Common JS
```js
require('@substrate-system/stream')
```

### pre-built JS
This package exposes minified JS files too. Copy them to a location that is
accessible to your web server, then link to them in HTML.

#### copy
```sh
cp ./node_modules/@substrate-system/stream/dist/index.min.js ./public/stream.min.js
```

#### HTML
```html
<script type="module" src="./stream.min.js"></script>
```
