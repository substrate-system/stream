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

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Example](#example)
- [API](#api)
  * [S.from](#sfrom)
  * [`.map`](#map)
  * [`.filter`](#filter)
  * [`.forEach`](#foreach)
  * [`.skip`](#skip)
  * [`.take`](#take)
  * [`.scan`](#scan)
  * [`.reduce`](#reduce)
  * [`.find`](#find)
  * [`.some`](#some)
  * [`.every`](#every)
  * [`.toArray`](#toarray)
  * [`.collect`](#collect)
  * [`.toStream`](#tostream)
- [Node helpers](#node-helpers)
  * [`toFileSink`](#tofilesink)
- [Modules](#modules)
  * [ESM](#esm)
  * [Common JS](#common-js)
  * [pre-built JS](#pre-built-js)
  * [copy](#copy)
  * [HTML](#html)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/stream
```


## Example

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


## API

Wrap a `ReadableStream` with chainable array-like methods. This provides a
fluent API like with arrays, but for streams. The predicate functions
can all be `async` too.


```ts
function S<T> (readable:ReadableStream<T>):EnhancedStream<T>
```

### S.from

Create an `EnhancedStream` from an array or iterable:

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

### `.map`

Like `array.map`. Transform each chunk using a mapping function.
The function can be sync or async.

```ts
map<U> (fn:(item:T) => U|Promise<U>):EnhancedStream<U>
```

```ts
const doubled = await S.from([1, 2, 3])
  .map(x => x * 2)
  .toArray();
// [2, 4, 6]

// Async mapping works too
const parsed = await S.from(['1', '2', '3'])
  .map(async s => JSON.parse(s))
  .toArray();
// [1, 2, 3]
```

### `.filter`

Like `array.filter` &mdash; keep only chunks that satisfy a predicate.

```ts
filter (predicate:(item:T) => boolean|Promise<boolean>):EnhancedStream<T>
```

```ts
const evens = await S.from([1, 2, 3, 4, 5, 6])
  .filter(x => x % 2 === 0)
  .toArray();
  // [2, 4, 6]
```

### `.forEach`

For side effects.

```ts
forEach (fn:(item:T) => void|Promise<void>):EnhancedStream<T>
```

```ts
const result = await S.from([1, 2, 3])
  .forEach(x => console.log('processing', x))
  .map(x => x * 10)
  .toArray();
// logs: processing 1, processing 2, processing 3
// [10, 20, 30]
```

### `.skip`

Skip the first `n` chunks and pass through the rest.

```ts
skip (n:number):EnhancedStream<T>
```

```ts
const skipped = await S.from([1, 2, 3, 4, 5])
  .skip(2)
  .toArray();
// [3, 4, 5]
```

### `.take`

Take the first `n` chunks from the stream and then terminate it. Useful for
limiting output or short-circuiting a long or infinite stream.

```ts
take (n:number):EnhancedStream<T>
```

```ts
// First 3 items
const first3 = await S.from([10, 20, 30, 40, 50])
  .take(3)
  .toArray();
  // [10, 20, 30]

// Composable with other methods
const result = await S.from([1, 2, 3, 4, 5, 6, 7, 8])
  .filter(x => x % 2 === 0)   // evens: [2, 4, 6, 8]
  .take(2)                     // first 2 evens: [2, 4]
  .toArray();
  // [2, 4]
```

### `.scan`

Like `reduce`, but emits each intermediate accumulated values instead of only
the final result. Useful for state machines, or any case where
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


### `.reduce`

Reduce the stream to a single value, like `Array.prototype.reduce`. The
function can be async.

```ts
reduce<U> (fn:(acc:U, item:T) => U|Promise<U>, initial:U):Promise<U>
```

```ts
const sum = await S.from([1, 2, 3, 4])
  .reduce((acc, x) => acc + x, 0);
// 10
```

### `.find`

Return the first chunk that satisfies the predicate, or `undefined` if none
match. The predicate can be async.

```ts
find (predicate:(item:T) => boolean|Promise<boolean>):Promise<T|undefined>
```

```ts
const found = await S.from([1, 2, 3, 4, 5])
  .find(x => x > 3);
// 4
```

### `.some`

Return `true` if any chunk satisfies the predicate. Short-circuits on the first
match. The predicate can be async.

```ts
some (predicate:(item:T) => boolean|Promise<boolean>):Promise<boolean>
```

```ts
const hasEven = await S.from([1, 3, 5, 6])
  .some(x => x % 2 === 0);
// true
```

### `.every`

Return `true` if every chunk satisfies the predicate. Short-circuits on the
first failure. The predicate can be async.

```ts
every (predicate:(item:T) => boolean|Promise<boolean>):Promise<boolean>
```

```ts
const allPositive = await S.from([1, 2, 3])
  .every(x => x > 0);
// true
```

### `.toArray`

Collect all chunks into an array.

```ts
toArray ():Promise<T[]>
```

```ts
const arr = await S.from([1, 2, 3])
  .map(x => x * 2)
  .toArray();
// [2, 4, 6]
```

### `.collect`

Collect chunks and auto-concatenate based on type. Typed arrays (e.g.
`Uint8Array`) are concatenated into a single typed array, strings are joined,
and everything else is returned as an array.

```ts
collect ():Promise<any>
```

```ts
// Strings are joined
const text = await S.from(['hello', ' ', 'world'])
  .collect();
// 'hello world'

// Typed arrays are concatenated
const buf = await S.from([new Uint8Array([1, 2]), new Uint8Array([3])])
  .collect();
// Uint8Array [1, 2, 3]
```

### `.toStream`

Return the underlying `ReadableStream`. Useful for interop with native stream
APIs. The `readable` property provides the same access.

```ts
toStream ():ReadableStream<T>
```

```ts
const stream = S.from([1, 2, 3]).toStream();
// ReadableStream<number>
```

## Node helpers

Node-specific helpers are available from the `@substrate-system/stream/node`
subpath.

### `toFileSink`

Create a writable web stream from a Node `FileHandle`. This is useful when
you want to `pipeTo` a file sink.

```ts
toFileSink (fh:FileHandle):WritableStream<Uint8Array>
```

```ts
import { open } from 'node:fs/promises'
import { toFileSink } from '@substrate-system/stream/node'

const out = await open('./result.html', 'w')
await someReadableStreamOfBytes.pipeTo(toFileSink(out))
```

## Modules

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).

### ESM
```js
import { S, EnhancedStream } from '@substrate-system/stream'
import { toFileSink } from '@substrate-system/stream/node'
```

### Common JS
```js
require('@substrate-system/stream')
require('@substrate-system/stream/node')
```

### pre-built JS
This package exposes minified JS files too. Copy them to a location that is
accessible to your web server, then link to them in HTML.

### copy
```sh
cp ./node_modules/@substrate-system/stream/dist/index.min.js ./public/stream.min.js
```

### HTML
```html
<script type="module" src="./stream.min.js"></script>
```
