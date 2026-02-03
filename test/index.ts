import { test } from '@substrate-system/tapzero'
import {
    from,
    through,
    collect,
    Stream,
    transform,
    filter,
    run
} from '../src/index.js'
import './methods.js'

// Example 1: Simple Transform Chain
test('simple transform chain', async t => {
    const pipeline = from([1, 2, 3, 4, 5])
        .pipe(through(x => x * 2))           // double each number
        .pipe(through(x => x + 1))           // add 1
        .pipe(through(x => `Number: ${x}`)) // convert to string

    const result = await collect(pipeline)

    t.equal(result.length, 5, 'should have 5 results')
    t.equal(result[0], 'Number: 3', 'first element should be "Number: 3"')
    t.equal(result[1], 'Number: 5', 'second element should be "Number: 5"')
    t.equal(result[2], 'Number: 7', 'third element should be "Number: 7"')
    t.equal(result[3], 'Number: 9', 'fourth element should be "Number: 9"')
    t.equal(result[4], 'Number: 11', 'fifth element should be "Number: 11"')
})

// Example 2: Text Processing (using mock data instead of fetch)
test('text processing', async t => {
    const textData = 'hello world\n  foo bar  \nbaz qux'

    const readable = new ReadableStream({
        start (controller) {
            controller.enqueue(textData)
            controller.close()
        }
    })

    const pipeline = Stream(readable)
        .pipe(through((text:string) => text.split('\n')))
        .pipe(through((lines:string[]) => {
            return lines.map((line: string) => line.trim())
        }))
        .pipe(through((lines:string[]) => {
            return lines.map((line: string) => line.toUpperCase())
        }))

    const results:string[][] = []
    await pipeline.pipeTo(new WritableStream({
        write (lines: string[]) {
            results.push(lines)
        }
    }))

    t.equal(results.length, 1, 'should have one batch of results')
    t.equal(results[0].length, 3, 'should have 3 lines')
    t.equal(results[0][0], 'HELLO WORLD', 'first line should be uppercase')
    t.equal(results[0][1], 'FOO BAR', 'second line should be uppercase')
    t.equal(results[0][2], 'BAZ QUX', 'third line should be uppercase')
})

// Example 3: JSON Processing
test('json processing', async t => {
    const users = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
    ]

    const pipeline = from(users)
        .pipe(through(user => user.age >= 30 ? user : null))
        .pipe(through(user => user?.name ?? null))

    const adults = await collect(pipeline)

    t.equal(adults.length, 3, 'should have 3 results')
    t.equal(adults[0], 'Alice', 'first result should be Alice')
    t.equal(adults[1], null, 'second result should be null')
    t.equal(adults[2], 'Charlie', 'third result should be Charlie')
})

// Example 4: File Processing with Flush
test('file processing with flush', async t => {
    let batch: string[] = []
    let flushCalled = false

    const batcher = through<string, string[]>(
        (item) => {
            batch.push(item)
            if (batch.length >= 3) {
                const result = [...batch]
                batch = []
                return result
            }
            return [] // Don't emit yet
        },
        () => {
            // Flush remaining items
            flushCalled = true
        }
    )

    const pipeline = from(['a', 'b', 'c', 'd', 'e']).pipe(batcher)
    const batches = await collect(pipeline)

    t.ok(flushCalled, 'flush function should be called')
    t.equal(batches.length, 5, 'should have 5 items (some empty arrays)')
    // Filter out empty arrays
    const nonEmpty = batches.filter(b => b.length > 0)
    t.equal(nonEmpty.length, 1, 'should have 1 non-empty batch')
    t.equal(nonEmpty[0].length, 3, 'first batch should have 3 items')
})

// Example 5: Custom Transformer (splitter)
test('custom transformer - split characters', async t => {
    const splitter = transform<string, string>({
        transform (
            chunk:string,
            controller:TransformStreamDefaultController<string>
        ) {
            for (const char of chunk) {
                controller.enqueue(char)
            }
        }
    })

    const pipeline = from(['hello', 'world']).pipe(splitter)
    const chars = await collect(pipeline)

    t.equal(chars.length, 10, 'should have 10 characters')
    t.equal(chars.join(''), 'helloworld', 'chars should spell helloworld')
    t.equal(chars[0], 'h', 'first char should be h')
    t.equal(chars[4], 'o', 'fifth char should be o')
})

// Example 6: Async transform
test('async transform', async t => {
    const asyncDouble = through(async (x: number) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1))
        return x * 2
    })

    const pipeline = from([1, 2, 3])
        .pipe(asyncDouble)
        .pipe(through(x => x + 1))

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results')
    t.equal(result[0], 3, 'first result should be 3')
    t.equal(result[1], 5, 'second result should be 5')
    t.equal(result[2], 7, 'third result should be 7')
})

// Test error handling in transform
test('error handling in transform', async t => {
    let errorCaught = false

    const errorTransform = through((x: number) => {
        if (x === 2) {
            throw new Error('Test error')
        }
        return x * 2
    })

    const pipeline = from([1, 2, 3]).pipe(errorTransform)

    try {
        await collect(pipeline)
    } catch (error) {
        errorCaught = true
        t.ok(error instanceof Error, 'should catch an error')
        t.equal((error as Error).message, 'Test error', 'error message should match')
    }

    t.ok(errorCaught, 'error should be caught')
})

// Test Stream() wrapper
test('source wrapper', async t => {
    const readable = new ReadableStream({
        start (controller) {
            controller.enqueue(1)
            controller.enqueue(2)
            controller.enqueue(3)
            controller.close()
        }
    })

    const pipeline = Stream(readable)
        .pipe(through(x => x * 2))

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results')
    t.equal(result[0], 2, 'first result should be 2')
    t.equal(result[1], 4, 'second result should be 4')
    t.equal(result[2], 6, 'third result should be 6')
})

// Test pipeTo()
test('pipeTo with writable stream', async t => {
    const results: number[] = []

    const writable = new WritableStream({
        write (chunk: number) {
            results.push(chunk)
        }
    })

    const pipeline = from([1, 2, 3])
        .pipe(through((x: number) => x * 2))

    await pipeline.pipeTo(writable)

    t.equal(results.length, 3, 'should have 3 results')
    t.equal(results[0], 2, 'first result should be 2')
    t.equal(results[1], 4, 'second result should be 4')
    t.equal(results[2], 6, 'third result should be 6')
})

// Test run() helper
test('run helper', async t => {
    let count = 0

    const counter = through((x: number) => {
        count++
        return x
    })

    const pipeline = from([1, 2, 3, 4, 5]).pipe(counter)

    await run(pipeline)

    t.equal(count, 5, 'should have processed 5 items')
})

// Test collect() helper
test('collect helper', async t => {
    const pipeline = from([1, 2, 3, 4, 5])

    const result = await collect(pipeline)

    t.equal(result.length, 5, 'should collect all 5 items')
    t.deepEqual(result, [1, 2, 3, 4, 5], 'should match original array')
})

// Test from() with async iterable
test('from with async iterable', async t => {
    async function * asyncGenerator () {
        yield 1
        yield 2
        yield 3
    }

    const pipeline = from(asyncGenerator())

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results')
    t.deepEqual(result, [1, 2, 3], 'should match expected values')
})

// Test chaining multiple pipes
test('multiple pipe chain', async t => {
    const pipeline = from([1, 2, 3])
        .pipe(through(x => x * 2))
        .pipe(through(x => x + 1))
        .pipe(through(x => x * 3))
        .pipe(through(x => `Result: ${x}`))

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results')
    t.equal(result[0], 'Result: 9', 'first: (1*2+1)*3 = 9')
    t.equal(result[1], 'Result: 15', 'second: (2*2+1)*3 = 15')
    t.equal(result[2], 'Result: 21', 'third: (3*2+1)*3 = 21')
})

// Test transform with flush
test('transform with flush callback', async t => {
    let flushCalled = false
    let lastValue: number | null = null

    const transformWithFlush = transform<number, number>({
        transform (
            chunk:number,
            controller:TransformStreamDefaultController<number>
        ) {
            lastValue = chunk
            controller.enqueue(chunk * 2)
        },
        flush (controller:TransformStreamDefaultController<number>) {
            flushCalled = true
            // Emit one final value
            if (lastValue !== null) {
                controller.enqueue(lastValue * 100)
            }
        }
    })

    const pipeline = from([1, 2, 3]).pipe(transformWithFlush)
    const result = await collect(pipeline)

    t.ok(flushCalled, 'flush should be called')
    t.equal(result.length, 4,
        'should have 4 results (3 transformed + 1 from flush)')
    t.equal(result[0], 2, 'first transformed value')
    t.equal(result[1], 4, 'second transformed value')
    t.equal(result[2], 6, 'third transformed value')
    t.equal(result[3], 300, 'flush value should be last value * 100')
})

// Test error in flush callback
test('error handling in flush callback', async t => {
    let errorCaught = false

    const errorFlush = through(
        (x: number) => x * 2,
        () => {
            throw new Error('Flush error')
        }
    )

    const pipeline = from([1, 2, 3]).pipe(errorFlush)

    try {
        await collect(pipeline)
    } catch (error) {
        errorCaught = true
        t.ok(error instanceof Error, 'should catch error')
        t.equal((error as Error).message, 'Flush error',
            'error message should match')
    }

    t.ok(errorCaught, 'error should be caught')
})

// Test empty stream
test('empty stream', async t => {
    const pipeline = from([])

    const result = await collect(pipeline)

    t.equal(result.length, 0, 'should have no results')
})

// Test single item stream
test('single item stream', async t => {
    const pipeline = from([42])
        .pipe(through(x => x * 2))

    const result = await collect(pipeline)

    t.equal(result.length, 1, 'should have 1 result')
    t.equal(result[0], 84, 'result should be 84')
})

// Test backpressure simulation (conceptual test)
test('backpressure handling', async t => {
    let processedCount = 0
    const totalItems = 100

    const slowProcessor = through(async (x: number) => {
        processedCount++
        // Simulate slow processing
        await new Promise(resolve => setTimeout(resolve, 1))
        return x * 2
    })

    const pipeline = from(Array.from({ length: totalItems }, (_, i) => i))
        .pipe(slowProcessor)

    await run(pipeline)

    t.equal(processedCount, totalItems, `should process all ${totalItems} items`)
})

// Test that backpressure actually pauses the producer
test('backpressure pauses producer', async t => {
    const producedItems:number[] = []
    const consumedItems:number[] = []
    let inFlight = 0
    let maxInFlight = 0
    let currentIndex = 0

    // Create a custom readable with tracking that uses pull() for backpressure
    const readable = new ReadableStream({
        pull (controller) {
            if (currentIndex < 20) {
                producedItems.push(currentIndex)
                inFlight++
                maxInFlight = Math.max(maxInFlight, inFlight)
                controller.enqueue(currentIndex)
                currentIndex++
            } else {
                controller.close()
            }
        }
    })

    // Slow consumer that simulates processing delay
    const pipeline = Stream(readable)
        .pipe(through(async (x: number) => {
            // Simulate slow processing
            await new Promise(resolve => setTimeout(resolve, 10))
            consumedItems.push(x)
            inFlight--
            return x
        }))

    await run(pipeline)

    t.equal(consumedItems.length, 20, 'should consume all items')
    t.ok(maxInFlight < 20,
        'backpressure should prevent all items being in flight at once')
    // With proper backpressure, max in-flight should be limited by the
    // browser's internal queuing strategy (typically around 1-5 items)
    t.ok(maxInFlight <= 10, 'max in-flight should be bounded by backpressure')
})

// Test backpressure with writable stream that controls flow
test('backpressure with slow writable', async t => {
    const chunks:number[] = []
    let writeCount = 0
    let maxQueuedBeforeWrite = 0

    // Create a slow writable stream
    const slowWritable = new WritableStream({
        async write (chunk:number) {
            maxQueuedBeforeWrite = Math.max(
                maxQueuedBeforeWrite,
                writeCount - chunks.length
            )
            writeCount++
            // Simulate slow write
            await new Promise(resolve => setTimeout(resolve, 5))
            chunks.push(chunk)
        }
    })

    const pipeline = from(Array.from({ length: 50 }, (_, i) => i))
        .pipe(through(x => x * 2))

    await pipeline.pipeTo(slowWritable)

    t.equal(chunks.length, 50, 'should write all 50 items')
    t.ok(maxQueuedBeforeWrite < 50, 'backpressure should prevent queueing all items')
})

// Test multiple values emitted per input (custom transformer)
test('one-to-many transform', async t => {
    const duplicator = transform<number, number>({
        transform (
            chunk:number,
            controller:TransformStreamDefaultController<number>
        ) {
            controller.enqueue(chunk)
            controller.enqueue(chunk)
        }
    })

    const pipeline = from([1, 2, 3]).pipe(duplicator)
    const result = await collect(pipeline)

    t.equal(result.length, 6, 'should have 6 results (each input duplicated)')
    t.deepEqual(result, [1, 1, 2, 2, 3, 3], 'should duplicate each value')
})

// Test filter pattern
test('filter pattern with custom transformer', async t => {
    const filter = transform<number, number>({
        transform (
            chunk:number,
            controller:TransformStreamDefaultController<number>
        ) {
            if (chunk > 2) {
                controller.enqueue(chunk)
            }
            // Don't enqueue if predicate is false - this filters it out
        }
    })

    const pipeline = from([1, 2, 3, 4, 5])
        .pipe(filter)
        .pipe(through(x => x * 2))

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results after filtering')
    t.deepEqual(result, [6, 8, 10], 'should filter and transform correctly')
})

// Test TypeScript type inference
test('type safety', async t => {
    // This test primarily validates TypeScript compilation
    const numberPipeline = from([1, 2, 3])
        .pipe(through((x:number) => x * 2))
        .pipe(through((x:number) => `Number: ${x}`))

    const result = await collect(numberPipeline)

    t.ok(typeof result[0] === 'string', 'result should be string')
    t.equal(result[0], 'Number: 2', 'transformation should work correctly')
})

// Test exported filter function
test('exported filter function', async t => {
    const pipeline = from([1, 2, 3, 4, 5])
        .pipe(filter(x => x > 2))
        .pipe(through(x => x * 2))

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 results after filtering')
    t.deepEqual(result, [6, 8, 10], 'should filter and transform correctly')
})

// Test filter with async predicate
test('filter with async predicate', async t => {
    const asyncFilter = filter(async (x: number) => {
        await new Promise(resolve => setTimeout(resolve, 1))
        return x % 2 === 0
    })

    const pipeline = from([1, 2, 3, 4, 5, 6])
        .pipe(asyncFilter)

    const result = await collect(pipeline)

    t.equal(result.length, 3, 'should have 3 even numbers')
    t.deepEqual(result, [2, 4, 6], 'should filter even numbers')
})

test('all done', () => {
    if (window) {
        // @ts-expect-error test
        window.testsFinished = true
    }
})
