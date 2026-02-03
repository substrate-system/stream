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
  * [`S` Example](#s-example)
- [API](#api)
  * [`S` API](#s-api)
    + [Transform Methods](#transform-methods)
    + [S.from](#sfrom)
    + [scan](#scan)
    + [Terminal Methods](#terminal-methods)
    + [Utility](#utility)
    + [Example](#example)
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

### `S` Example

Create a stream with chainable methods like an Array. The stream is effectively
an array that consumes time instead of space.

```ts
import { S } from '@substrate-system/stream'

const result = await S.from([1, 2, 3, 4, 5, 6])
  .filter(x => x % 2 === 0)  // keep evens: [2, 4, 6]
  .map(x => x * 10)          // multiply: [20, 40, 60]
  .map(async x => x * 10)    // async functions (promises) are fine
  .toArray()
// => [200, 400, 600]

// Running totals with scan
const totals = await S.from([1, 2, 3, 4])
  .scan((acc, x) => acc + x, 0)
  .toArray()
// => [1, 3, 6, 10]
```

## API

### `S` API

Wrap a `ReadableStream` with chainable array-like methods. This provides a
fluent API like with arrays, but for streams. The predicate functions
can all be `async` too.


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
you need to see intermediate states. See
[reactivex.io/scan](https://reactivex.io/documentation/operators/scan.html)

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
| `collect()` | Collect and auto-concatenate (typed arrays, strings, or array) |

#### Utility

| Property/Method | Description |
|-----------------|-------------|
| `readable` | Access the underlying `ReadableStream` |
| `toStream()` | Access the underlying `ReadableStream` |

#### Example

```ts
import { S } from '@substrate-system/stream';

// Chain operations like array methods
const result = await S.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  .skip(2)                    // skip first 2: [3, 4, 5, 6, 7, 8, 9, 10]
  .filter(x => x % 2 === 0)   // keep evens: [4, 6, 8, 10]
  .map(x => x * 2)            // double: [8, 12, 16, 20]
  .take(3)                    // first 3: [8, 12, 16]
  .toArray();

console.log(result);
// [8, 12, 16]

// Terminal methods
const sum = await S.from([1, 2, 3, 4])
  .reduce((acc, x) => acc + x, 0);
// 10

const found = await S.from([1, 2, 3, 4, 5])
  .find(x => x > 3);
// 4

const hasEven = await S.from([1, 3, 5, 6])
  .some(x => x % 2 === 0);
// true

const allPositive = await S.from([1, 2, 3])
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

## Modules

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import { S, EnhancedStream } from '@substrate-system/stream'
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
