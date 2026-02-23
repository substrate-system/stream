import { test } from '@substrate-system/tapzero'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toFileSink } from '../src/node.js'

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
        }).pipeTo(toFileSink(fh))

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

    const writer = toFileSink(fh).getWriter()
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

    const writer = toFileSink(fh).getWriter()
    await writer.abort(new Error('cancelled'))

    t.equal(closes, 1, 'should close handle on abort')
    t.equal(truncated, false, 'should not truncate on abort')
})
