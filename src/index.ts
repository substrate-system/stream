export class EnhancedStream<T> {
    readonly readable:ReadableStream<T>

    constructor (readable:ReadableStream<T>) {
        this.readable = readable
    }

    map<U> (fn:(item:T) => U|Promise<U>):EnhancedStream<U> {
        const ts = new TransformStream<T, U>({
            async transform (chunk, controller) {
                controller.enqueue(await fn(chunk))
            },
        })
        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    filter (predicate:(item:T) => boolean|Promise<boolean>):EnhancedStream<T> {
        const ts = new TransformStream<T, T>({
            async transform (chunk, controller) {
                if (await predicate(chunk)) {
                    controller.enqueue(chunk)
                }
            },
        })

        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    /**
     * Sideeffects.
     *
     * @returns {EnhancedStream<T>}
     */
    forEach (fn:(item:T) => void|Promise<void>):EnhancedStream<T> {
        const ts = new TransformStream<T, T>({
            async transform (chunk, controller) {
                await fn(chunk)
                controller.enqueue(chunk)
            },
        })
        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    take (n:number):EnhancedStream<T> {
        let count = 0
        const ts = new TransformStream<T, T>({
            transform (chunk, controller) {
                if (count < n) {
                    controller.enqueue(chunk)
                    count++
                }
                if (count >= n) {
                    controller.terminate()
                }
            },
        })
        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    skip (n:number):EnhancedStream<T> {
        let count = 0
        const ts = new TransformStream<T, T>({
            transform (chunk, controller) {
                if (count >= n) {
                    controller.enqueue(chunk)
                }
                count++
            },
        })
        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    scan<U> (fn:(acc:U, item:T) => U|Promise<U>, initial:U):EnhancedStream<U> {
        let acc = initial
        const ts = new TransformStream<T, U>({
            async transform (chunk, controller) {
                acc = await fn(acc, chunk)
                controller.enqueue(acc)
            },
        })
        return new EnhancedStream(this.readable.pipeThrough(ts))
    }

    async reduce<U> (
        fn:(acc:U, item:T) => U|Promise<U>,
        initial:U
    ):Promise<U> {
        let acc = initial
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                acc = await fn(acc, value)
            }
        } finally {
            reader.releaseLock()
        }

        return acc
    }

    async find (
        predicate:(item:T) => boolean|Promise<boolean>
    ):Promise<T|undefined> {
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) return undefined
                if (await predicate(value)) return value
            }
        } finally {
            reader.releaseLock()
        }
    }

    async some (
        predicate:(item:T) => boolean|Promise<boolean>
    ):Promise<boolean> {
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) return false
                if (await predicate(value)) return true
            }
        } finally {
            reader.releaseLock()
        }
    }

    async every (
        predicate:(item:T) => boolean|Promise<boolean>
    ):Promise<boolean> {
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) return true
                if (!await predicate(value)) return false
            }
        } finally {
            reader.releaseLock()
        }
    }

    async toArray ():Promise<T[]> {
        const results:T[] = []
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                results.push(value)
            }
        } finally {
            reader.releaseLock()
        }
        return results
    }

    async collect ():Promise<any> {
        const chunks:T[] = []
        const reader = this.readable.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                chunks.push(value)
            }
        } finally {
            reader.releaseLock()
        }

        if (chunks.length === 0) {
            return chunks
        }

        const first = chunks[0]

        // Typed arrays (Uint8Array, Float32Array, etc.) and Buffer
        // concatenate
        if (ArrayBuffer.isView(first)) {
            const typedChunks = chunks as unknown as ArrayBufferView[]
            const totalLength = typedChunks.reduce((sum, chunk) => {
                return sum + (chunk as any).length
            }, 0)
            const TypedArrayConstructor = first.constructor as new (
                length:number
            ) => any
            const result = new TypedArrayConstructor(totalLength)
            let offset = 0
            for (const chunk of typedChunks) {
                result.set(chunk, offset)
                offset += (chunk as any).length
            }
            return result
        }

        // Strings -- concatenate
        if (typeof first === 'string') {
            return (chunks as unknown as string[]).join('')
        }

        // Everything else -- array
        return chunks
    }

    toStream ():ReadableStream<T> {
        return this.readable
    }
}

export interface SFunction {
    <T>(readable:ReadableStream<T>):EnhancedStream<T>;
    from<T>(iterable:Iterable<T>|AsyncIterable<T>):EnhancedStream<T>;
}

/**
 * Wrap a ReadableStream with array-like chainable methods.
 */
export const S:SFunction = Object.assign(
    function <T> (readable:ReadableStream<T>):EnhancedStream<T> {
        return new EnhancedStream(readable)
    },

    {
        /**
         * Create an EnhancedStream from an array or iterable.
         */
        from<T> (iterable:Iterable<T>|AsyncIterable<T>):EnhancedStream<T> {
            const readable = new ReadableStream<T>({
                async start (controller) {
                    try {
                        for await (const item of iterable) {
                            controller.enqueue(item)
                        }
                        controller.close()
                    } catch (error) {
                        controller.error(error)
                    }
                },
            })

            return new EnhancedStream(readable)
        },
    }
)
