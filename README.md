# stream
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/stream/nodejs.yml?style=flat-square)](https://github.com/substrate-system/stream/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/icons?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/stream)](https://packagephobia.com/result?p=@substrate-system/stream)
[![gzip size](https://flat.badgen.net/bundlephobia/minzip/@substrate-system/stream)](https://bundlephobia.com/package/@substrate-system/stream)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg?style=flat-square)](package.json)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


Use the native browser [streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API),
but with a nicer wrapper.

[See a live demo](https://substrate-system.github.io/stream/)

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Examples](#examples)
  * [Simple Transform Chain](#simple-transform-chain)
  * [Text Processing](#text-processing)
  * [JSON Processing](#json-processing)
  * [File Processing with Flush](#file-processing-with-flush)
- [Comparison with Raw TransformStream API](#comparison-with-raw-transformstream-api)
  * [The Awkward Way (Native API)](#the-awkward-way-native-api)
  * [The Nice Way (This API)](#the-nice-way-this-api)
- [Advanced: Custom Transformer](#advanced-custom-transformer)
- [Real-World Example: Processing Large CSV](#real-world-example-processing-large-csv)
- [Example: Backpressure in Action](#example-backpressure-in-action)
- [Helper: Filter Transform](#helper-filter-transform)
- [Modules](#modules)
  * [ESM](#esm)
  * [Common JS](#common-js)
  * [pre-built JS](#pre-built-js)

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

### Text Processing

```typescript
import { source, through, sink } from '@substrate-system/stream';

// Fetch and process text line by line
const response = await fetch('data.txt');

const pipeline = source(response.body.pipeThrough(new TextDecoderStream()))
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
import { from, through, collect } from '@substrate-system/stream';

const users = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 }
];

const pipeline = from(users)
  .pipe(through(user => user.age >= 30 ? user : null))
  .pipe(through(user => user?.name ?? null))
  .pipe(through(name => name)); // In real app, add filter transform

const adults = await collect(pipeline);
console.log(adults);
// ['Alice', null, 'Charlie'] - would filter nulls with proper transform
```

### File Processing with Flush

```typescript
import { through, from, collect } from '@substrate-system/stream';

// Batch processing with flush
let batch: string[] = [];

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

## Comparison with Raw TransformStream API

### The Awkward Way (Native API)

```ts
// Native TransformStream API - verbose and awkward
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

// Awkward piping - can't chain nicely
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

### The Nice Way (This API)

```ts
// With stream-pipe - clean and readable
const response = await fetch('data.json');

const pipeline = source(response.body)
  .pipe(through(chunk => new TextDecoder().decode(chunk)))
  .pipe(through(text => JSON.parse(text)))
  .pipe(through(obj => obj.active ? obj : null));

const results = await collect(pipeline);
```

## Advanced: Custom Transformer

If you need more control (e.g., emitting multiple values per input),
use the full `transform()` with a Transformer object:

```typescript
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

## Real-World Example: Processing Large CSV

```ts
import { source, through, run } from '@substrate-system/stream';

const response = await fetch('large-data.csv');

interface CSVRow {
  id: number;
  name: string;
  value: number;
}

const pipeline = source(response.body)
  .pipe(through(chunk => new TextDecoder().decode(chunk)))
  .pipe(through(text => text.split('\n')))
  .pipe(through(line => {
    const [id, name, value] = line.split(',');
    return { id: parseInt(id), name, value: parseFloat(value) } as CSVRow;
  }))
  .pipe(through(row => row.value > 100 ? row : null))
  .pipe(through(row => row ? JSON.stringify(row) : null));

await pipeline.pipeTo(new WritableStream({
  write(json) {
    if (json) {
      console.log(json);
      // or send to another API, write to IndexedDB, etc.
    }
  }
}));
```

## Example: Backpressure in Action

```ts
import { from, through } from '@substrate-system/stream';

// Slow processor - backpressure will prevent memory buildup
const slowProcessor = through(async (x: number) => {
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

## Helper: Filter Transform

Since filtering is common, there is a reusable helper:

```ts
import { through } from '@substrate-system/stream';

export function filter<T>(predicate:(item:T) => boolean|Promise<boolean>) {
  return transform<T | null, T>({
    async transform(chunk, controller) {
      if (chunk !== null && await predicate(chunk)) {
        controller.enqueue(chunk);
      }
      // Don't enqueue if predicate is false
      // This filters it out
    }
  });
}

const pipeline = from([1, 2, 3, 4, 5])
  .pipe(filter(x => x > 2))
  .pipe(through(x => x * 2));

const result = await collect(pipeline);
console.log(result);  // [6, 8, 10]
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
    source,
    sink,
    transform,
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
