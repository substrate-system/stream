import { test } from '@substrate-system/tapzero'
import { pngBytes } from './util.js'
import { S } from '../src/index.js'
const { from } = S

test('Can chain the method calls', async t => {
    const stream = from([1, 2, 3, 4, 5])
    const result = await S(stream.readable)
        .filter(n => n % 2 === 0)
        .map(n => n * 10)
        .toArray()

    t.deepEqual(result, [20, 40], 'should filter evens and multiply by 10')
})

test('S.from creates an EnhancedStream from an array', async t => {
    const result = await S.from([1, 2, 3, 4, 5])
        .filter(x => x % 2 === 0)
        .map(x => x * 10)
        .toArray()

    t.deepEqual(result, [20, 40],
        'should work like from() but return EnhancedStream')
})

test('S.from works with async iterables', async t => {
    async function * asyncGen () {
        yield 1
        yield 2
        yield 3
    }

    const result = await S.from(asyncGen())
        .map(x => x * 2)
        .toArray()

    t.deepEqual(result, [2, 4, 6])
})

test('map transforms each chunk', async t => {
    const stream = from(['a', 'b', 'c'])
    const result = await S(stream.readable)
        .map(x => x.toUpperCase())
        .toArray()

    t.deepEqual(result, ['A', 'B', 'C'])
})

test('filter removes non-matching chunks', async t => {
    const stream = from([1, 2, 3, 4, 5, 6])
    const result = await S(stream.readable)
        .filter(x => x > 3)
        .toArray()

    t.deepEqual(result, [4, 5, 6])
})

test('forEach executes side effects', async t => {
    const seen:number[] = []
    const stream = from([1, 2, 3])
    const result = await S(stream.readable)
        .forEach(x => { seen.push(x) })
        .toArray()

    t.deepEqual(seen, [1, 2, 3], 'side effects executed')
    t.deepEqual(result, [1, 2, 3], 'values passed through')
})

test('take gets first N chunks', async t => {
    const stream = from([1, 2, 3, 4, 5])
    const result = await S(stream.readable)
        .take(3)
        .toArray()

    t.deepEqual(result, [1, 2, 3])
})

test('skip skips first N chunks', async t => {
    const stream = from([1, 2, 3, 4, 5])
    const result = await S(stream.readable)
        .skip(2)
        .toArray()

    t.deepEqual(result, [3, 4, 5])
})

test('reduce accumulates values', async t => {
    const stream = from([1, 2, 3, 4])
    const result = await S(stream.readable)
        .reduce((acc, x) => acc + x, 0)

    t.equal(result, 10)
})

test('find returns first match', async t => {
    const stream = from([1, 2, 3, 4, 5])
    const result = await S(stream.readable)
        .find(x => x > 3)

    t.equal(result, 4)
})

test('find returns undefined when no match', async t => {
    const stream = from([1, 2, 3])
    const result = await S(stream.readable)
        .find(x => x > 10)

    t.equal(result, undefined)
})

test('some returns true when any match', async t => {
    const stream = from([1, 2, 3, 4])
    const result = await S(stream.readable)
        .some(x => x === 3)

    t.equal(result, true)
})

test('some returns false when none match', async t => {
    const stream = from([1, 2, 3])
    const result = await S(stream.readable)
        .some(x => x > 10)

    t.equal(result, false)
})

test('every returns true when all match', async t => {
    const stream = from([2, 4, 6])
    const result = await S(stream.readable)
        .every(x => x % 2 === 0)

    t.equal(result, true)
})

test('every returns false when any fail', async t => {
    const stream = from([2, 3, 4])
    const result = await S(stream.readable)
        .every(x => x % 2 === 0)

    t.equal(result, false)
})

test('scan emits intermediate accumulated values', async t => {
    const result = await S.from([1, 2, 3])
        .scan((acc, x) => acc + x, 0)
        .toArray()

    t.deepEqual(result, [1, 3, 6], 'should emit running totals')
})

test('scan with initial value', async t => {
    const result = await S.from([1, 2, 3])
        .scan((acc, x) => acc + x, 10)
        .toArray()

    t.deepEqual(result, [11, 13, 16], 'should start from initial value')
})

test('scan can be chained', async t => {
    const result = await S.from([1, 2, 3, 4])
        .scan((acc, x) => acc + x, 0)
        .filter(x => x > 3)
        .toArray()

    t.deepEqual(result, [6, 10], 'should filter scan results')
})

test('complex chain', async t => {
    const stream = from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const result = await S(stream.readable)
        .skip(2)
        .filter(x => x % 2 === 0)
        .map(x => x * 2)
        .take(3)
        .toArray()

    t.deepEqual(result, [8, 12, 16])
})

test('collect concatenates Uint8Array chunks into single buffer', async t => {
    const chunk1 = new Uint8Array([1, 2, 3])
    const chunk2 = new Uint8Array([4, 5])
    const chunk3 = new Uint8Array([6, 7, 8, 9])

    const result = await S.from([chunk1, chunk2, chunk3]).collect()

    t.ok(result instanceof Uint8Array, 'should return Uint8Array')
    t.deepEqual([...result], [1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('collect concatenates strings into single string', async t => {
    const result = await S.from(['hello', ' ', 'world']).collect()

    t.equal(result, 'hello world')
})

test('collect returns array for objects', async t => {
    const result = await S.from([{ id: 1 }, { id: 2 }, { id: 3 }]).collect()

    t.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }])
})

test('collect returns array for numbers', async t => {
    const result = await S.from([1, 2, 3]).collect()

    t.deepEqual(result, [1, 2, 3])
})

test('collect returns empty array for empty stream', async t => {
    const result = await S.from([]).collect()

    t.deepEqual(result, [])
})

test('.collect with a string', async t => {
    const res = await S.from(['hello', ' ', 'world']).collect()
    t.equal(res, 'hello world', 'should concatenate the strings')
})

test('collect works with chained transformations', async t => {
    const chunk1 = new Uint8Array([1, 2, 3, 4])
    const chunk2 = new Uint8Array([5, 6, 7, 8])

    const result = await S.from([chunk1, chunk2])
        .map(chunk => chunk.slice(1, 3))
        .collect()

    t.ok(result instanceof Uint8Array, 'should return Uint8Array')
    t.deepEqual([...result], [2, 3, 6, 7])
})

test('stream and collect an image buffer via createDownloadStream', async t => {
    // Simulate streaming the image in small chunks
    const stream = createDownloadStream(pngBytes, 16, 10)

    // Wrap with S and collect back into a single buffer
    const result = await S(stream).collect()

    t.ok(result instanceof Uint8Array, 'should return a Uint8Array')
    t.equal(result.length, pngBytes.length,
        'should have same length as original')
    t.deepEqual([...result], [...pngBytes],
        'bytes should match original')
})

test('all done', () => {
    // @ts-expect-error tests
    window.testsFinished = true
})

function createDownloadStream (
    buffer:Uint8Array,
    chunkSize:number = 1024,
    delay:number = 50
) {
    let offset = 0

    return new ReadableStream({
        async pull (controller) {
            if (offset >= buffer.byteLength) {
                controller.close()
                return
            }

            // Extract a slice (chunk) of the buffer
            const chunk = buffer.slice(offset, offset + chunkSize)
            controller.enqueue(chunk)
            offset += chunkSize

            // Introduce a pause to simulate network latency
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    })
}
