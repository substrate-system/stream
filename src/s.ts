/**
 * Enhanced stream with array-like chainable methods.
 */
export interface EnhancedStream<T> {
    readonly readable:ReadableStream<T>;

    /** Transform each chunk. */
    map<U>(fn:(item:T) => U|Promise<U>):EnhancedStream<U>;

    /** Filter chunks based on a predicate. */
    filter(predicate:(item:T) => boolean|Promise<boolean>):EnhancedStream<T>;

    /** Execute a side effect for each chunk (pass-through). */
    forEach(fn:(item:T) => void|Promise<void>):EnhancedStream<T>;

    /** Take the first N chunks. */
    take(n:number):EnhancedStream<T>;

    /** Skip the first N chunks. */
    skip(n:number):EnhancedStream<T>;

    /**
     * Like reduce, but emits each intermediate accumulated value.
     */
    scan<U>(fn:(acc:U, item:T) => U|Promise<U>, initial:U):EnhancedStream<U>;

    /** Reduce to a single value. Terminal operation. */
    reduce<U>(fn:(acc:U, item:T) => U|Promise<U>, initial:U):Promise<U>;

    /** Find the first chunk matching the predicate. Terminal operation. */
    find(predicate:(item:T) => boolean|Promise<boolean>):Promise<T|undefined>;

    /** Check if any chunk matches the predicate. Terminal operation. */
    some(predicate:(item:T) => boolean|Promise<boolean>):Promise<boolean>;

    /** Check if all chunks match the predicate. Terminal operation. */
    every(predicate:(item:T) => boolean|Promise<boolean>):Promise<boolean>;

    /** Collect all chunks into an array. Terminal operation. */
    toArray():Promise<T[]>;

    /**
     * Collect the stream into its natural form. Terminal operation.
     * - Typed arrays (Uint8Array, Buffer, etc.) -> single concatenated buffer
     * - Strings -> single concatenated string
     * - Objects/other -> array
     */
    collect():Promise<T extends ArrayBufferView ?
        T :
        T extends string ? string : T[]
    >;
}

interface SFunction {
    <T>(readable:ReadableStream<T>):EnhancedStream<T>;
    from<T>(iterable:Iterable<T>|AsyncIterable<T>):EnhancedStream<T>;
}

/**
 * Wrap a ReadableStream with array-like chainable methods.
 */
export const S:SFunction = Object.assign(
    function <T> (readable:ReadableStream<T>):EnhancedStream<T> {
        return createEnhanced<T>(readable)
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

            return createEnhanced(readable)
        },
    }
)

function createEnhanced<U=any> (r:ReadableStream<U>):EnhancedStream<U> {
    return {
        readable: r,

        map<V> (fn:(item:U) => V|Promise<V>):EnhancedStream<V> {
            const ts = new TransformStream<U, V>({
                async transform (
                    chunk:U,
                    controller:TransformStreamDefaultController<V>
                ) {
                    controller.enqueue(await fn(chunk))
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        filter (predicate:(item:U) => boolean|Promise<boolean>):EnhancedStream<U> {
            const ts = new TransformStream<U, U>({
                async transform (
                    chunk:U,
                    controller:TransformStreamDefaultController<U>
                ) {
                    if (await predicate(chunk)) {
                        controller.enqueue(chunk)
                    }
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        forEach (fn:(item:U) => void|Promise<void>):EnhancedStream<U> {
            const ts = new TransformStream<U, U>({
                async transform (chunk:U, controller:TransformStreamDefaultController<U>) {
                    await fn(chunk)
                    controller.enqueue(chunk)
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        take (n:number):EnhancedStream<U> {
            let count = 0
            const ts = new TransformStream<U, U>({
                transform (chunk:U, controller:TransformStreamDefaultController<U>) {
                    if (count < n) {
                        controller.enqueue(chunk)
                        count++
                    }
                    if (count >= n) {
                        controller.terminate()
                    }
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        skip (n:number):EnhancedStream<U> {
            let count = 0
            const ts = new TransformStream<U, U>({
                transform (chunk:U, controller:TransformStreamDefaultController<U>) {
                    if (count >= n) {
                        controller.enqueue(chunk)
                    }
                    count++
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        scan<V> (fn:(acc:V, item:U) => V|Promise<V>, initial:V):EnhancedStream<V> {
            let acc = initial
            const ts = new TransformStream<U, V>({
                async transform (chunk:U, controller:TransformStreamDefaultController<V>) {
                    acc = await fn(acc, chunk)
                    controller.enqueue(acc)
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        async reduce<V> (fn:(acc:V, item:U) => V|Promise<V>, initial:V):Promise<V> {
            let acc = initial
            const reader = r.getReader()
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
        },

        async find (predicate:(item:U) => boolean|Promise<boolean>):Promise<U|undefined> {
            const reader = r.getReader()
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) return undefined
                    if (await predicate(value)) return value
                }
            } finally {
                reader.releaseLock()
            }
        },

        async some (predicate:(item:U) => boolean|Promise<boolean>):Promise<boolean> {
            const reader = r.getReader()
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) return false
                    if (await predicate(value)) return true
                }
            } finally {
                reader.releaseLock()
            }
        },

        async every (predicate:(item:U) => boolean|Promise<boolean>):Promise<boolean> {
            const reader = r.getReader()
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) return true
                    if (!await predicate(value)) return false
                }
            } finally {
                reader.releaseLock()
            }
        },

        async toArray ():Promise<U[]> {
            const results:U[] = []
            const reader = r.getReader()
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
        },

        async collect ():Promise<any> {
            const chunks:U[] = []
            const reader = r.getReader()
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

            // Typed arrays (Uint8Array, Float32Array, etc.) and Buffer → concatenate
            if (ArrayBuffer.isView(first)) {
                const typedChunks = chunks as unknown as ArrayBufferView[]
                const totalLength = typedChunks.reduce((sum, chunk) => sum + (chunk as any).length, 0)
                const TypedArrayConstructor = first.constructor as new (length:number) => any
                const result = new TypedArrayConstructor(totalLength)
                let offset = 0
                for (const chunk of typedChunks) {
                    result.set(chunk, offset)
                    offset += (chunk as any).length
                }
                return result
            }

            // Strings → concatenate
            if (typeof first === 'string') {
                return (chunks as unknown as string[]).join('')
            }

            // Everything else → array
            return chunks
        }
    }
}
