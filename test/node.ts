import { test } from '@substrate-system/tapzero'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fromFile, toFile } from '../src/node.js'

test('toFileSink writes bytes to a file and truncates on close', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'stream-node-test-'))
    const file = join(dir, 'output.bin')

    await writeFile(file, new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]))
    const fh = await open(file, 'r+')

    try {
        await new ReadableStream<Uint8Array>({
            start (controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]))
                controller.enqueue(new Uint8Array([4, 5]))
                controller.close()
            }
        }).pipeTo(await toFile(fh))

        const out = await readFile(file)
        t.deepEqual([...out], [1, 2, 3, 4, 5],
            'should write chunks and truncate old file contents')
    } finally {
        await fh.close().catch(() => {})
        await rm(dir, { recursive: true, force: true })
    }
})

test('toFileSink retries when write reports partial progress', async t => {
    const written = new Uint8Array(8)
    const calls:Array<{ offset:number, length:number, position:number }> = []
    let truncatedTo:number|undefined
    let closes = 0

    const fh = {
        async write (
            chunk:Uint8Array,
            offset:number,
            length:number,
            position:number
        ) {
            const bytesWritten = Math.min(2, length)
            written.set(chunk.subarray(offset, offset + bytesWritten), position)
            calls.push({ offset, length, position })
            return { bytesWritten }
        },
        async truncate (len:number = 0) {
            truncatedTo = len
        },
        async close () {
            closes++
        }
    }

    const writer = (await toFile(fh)).getWriter()
    await writer.write(new Uint8Array([10, 11, 12, 13, 14]))
    await writer.close()

    t.ok(calls.length > 1, 'should call write repeatedly for a single chunk')
    t.deepEqual([...written.slice(0, 5)], [10, 11, 12, 13, 14],
        'should write all bytes in order')
    t.equal(truncatedTo, 5, 'should truncate to written length')
    t.equal(closes, 1, 'should close file handle once')
})

test('toFileSink closes file handle on abort without truncating', async t => {
    let truncated = false
    let closes = 0

    const fh = {
        async write () {
            return { bytesWritten: 0 }
        },
        async truncate () {
            truncated = true
        },
        async close () {
            closes++
        }
    }

    const writer = (await toFile(fh)).getWriter()
    await writer.abort(new Error('cancelled'))

    t.equal(closes, 1, 'should close handle on abort')
    t.equal(truncated, false, 'should not truncate on abort')
})

test('fromFile with a string path', async t => {
    const dir = await mkdtemp(
        join(tmpdir(), 'stream-node-test-')
    )
    const file = join(dir, 'input.txt')
    await writeFile(file, 'hello')

    try {
        const stream = await fromFile(file)
        const reader = stream.getReader()
        const chunks:Uint8Array[] = []

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
        }

        const result = Buffer.concat(chunks).toString()
        t.equal(result, 'hello',
            'should read file contents via string path')
        t.ok(stream.fileHandle,
            'should expose fileHandle on stream')
        await stream.fileHandle.close()
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('fromFile with a FileHandle', async t => {
    const dir = await mkdtemp(
        join(tmpdir(), 'stream-node-test-')
    )
    const file = join(dir, 'input.txt')
    await writeFile(file, 'world')

    const fh = await open(file)
    try {
        const stream = await fromFile(fh)
        const reader = stream.getReader()
        const chunks:Uint8Array[] = []

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
        }

        const result = Buffer.concat(chunks).toString()
        t.equal(result, 'world',
            'should read file contents via FileHandle')
        t.equal(stream.fileHandle, fh,
            'should use the same FileHandle that was passed in')
    } finally {
        await fh.close().catch(() => {})
        await rm(dir, { recursive: true, force: true })
    }
})

test('toFile with a string path', async t => {
    const dir = await mkdtemp(
        join(tmpdir(), 'stream-node-test-')
    )
    const file = join(dir, 'output.bin')

    try {
        await new ReadableStream<Uint8Array>({
            start (controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]))
                controller.close()
            }
        }).pipeTo(await toFile(file))

        const out = await readFile(file)
        t.deepEqual([...out], [1, 2, 3],
            'should write via string path')
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})
