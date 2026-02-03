/**
 * A nice API for browser streams, with backpressure.
 */

interface PipeableStream<R=any, W=any> {
    readable:ReadableStream<R>;
    writable:WritableStream<W>;
    pipe<T>(next:PipeableStream<T, R>):PipeableStream<T, W>;
    pipeTo(destination:WritableStream<R>):Promise<void>;
}

interface TransformFunction<I, O> {
    (chunk:I):O|Promise<O>;
}

/**
 * Wrap a ReadableStream in our API.
 */
export function Stream<R> (
    readable:ReadableStream<R>
):PipeableStream<R, never> {
    return {
        readable,
        writable: null as any,
        pipe<T> (next:PipeableStream<T, R>):PipeableStream<T, never> {
            // Don't await here - just connect the streams
            // Backpressure will propagate through the chain automatically
            const pipedReadable = this.readable.pipeThrough({
                readable: next.readable,
                writable: next.writable,
            })

            return {
                readable: pipedReadable,
                writable: null as any,
                pipe<U> (another: PipeableStream<U, T>):PipeableStream<U, never> {
                    return Stream(pipedReadable).pipe(another)
                },
                async pipeTo (destination:WritableStream<T>) {
                    return pipedReadable.pipeTo(destination)
                },
            }
        },
        async pipeTo (destination:WritableStream<R>) {
            return this.readable.pipeTo(destination)
        },
    }
}

/**
 * Create a transform stream with just a function.
 */
export function through<I, O> (
    transformFn:TransformFunction<I, O>,
    flushFn?:()=>void|Promise<void>
):PipeableStream<O, I> {
    const transformer:Transformer<I, O> = {
        async transform (chunk, controller) {
            try {
                const result = await transformFn(chunk)
                controller.enqueue(result)
            } catch (error) {
                controller.error(error)
            }
        },
        async flush (controller) {
            if (flushFn) {
                try {
                    await flushFn()
                } catch (error) {
                    controller.error(error)
                }
            }
        },
    }

    const transformStream = new TransformStream<I, O>(transformer)

    return {
        readable: transformStream.readable,
        writable: transformStream.writable,
        pipe<T> (next:PipeableStream<T, O>):PipeableStream<T, I> {
            // Use pipeThrough to maintain backpressure
            const pipedReadable = this.readable.pipeThrough({
                readable: next.readable,
                writable: next.writable,
            })

            return {
                readable: pipedReadable,
                writable: transformStream.writable,
                pipe<U> (another: PipeableStream<U, T>):PipeableStream<U, I> {
                    const furtherPiped = pipedReadable.pipeThrough({
                        readable: another.readable,
                        writable: another.writable,
                    })

                    return {
                        readable: furtherPiped,
                        writable: transformStream.writable,
                        pipe: Stream(furtherPiped).pipe.bind(Stream(furtherPiped)),
                        pipeTo: (dest) => furtherPiped.pipeTo(dest),
                    }
                },
                async pipeTo (destination:WritableStream<T>) {
                    return pipedReadable.pipeTo(destination)
                },
            }
        },
        async pipeTo (destination:WritableStream<O>) {
            return this.readable.pipeTo(destination)
        },
    }
}

/**
 * Create a transform stream the long way.
 */
export function transform<I, O> (
    transformer:Transformer<I, O>
):PipeableStream<O, I> {
    const transformStream = new TransformStream<I, O>(transformer)

    return {
        readable: transformStream.readable,
        writable: transformStream.writable,
        pipe<T> (next: PipeableStream<T, O>):PipeableStream<T, I> {
            const pipedReadable = this.readable.pipeThrough({
                readable: next.readable,
                writable: next.writable,
            })

            return {
                readable: pipedReadable,
                writable: transformStream.writable,
                pipe<U> (another: PipeableStream<U, T>):PipeableStream<U, I> {
                    const furtherPiped = pipedReadable.pipeThrough({
                        readable: another.readable,
                        writable: another.writable,
                    })
                    return {
                        readable: furtherPiped,
                        writable: transformStream.writable,
                        pipe: Stream(furtherPiped).pipe.bind(Stream(furtherPiped)),
                        pipeTo: (dest) => furtherPiped.pipeTo(dest),
                    }
                },
                async pipeTo (destination:WritableStream<T>) {
                    return pipedReadable.pipeTo(destination)
                },
            }
        },
        async pipeTo (destination: WritableStream<O>) {
            return this.readable.pipeTo(destination)
        },
    }
}

/**
 * Create a readable stream from an array or iterable.
 */
export function from<T> (
    iterable:Iterable<T>|AsyncIterable<T>
):PipeableStream<T, never> {
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

    return Stream(readable)
}

/**
 * Helper -- collect all values from a stream into an array.
 * This will respect backpressure since we read one chunk at a time.
 */
export async function collect<T> (stream:PipeableStream<T, any>):Promise<T[]> {
    const results:T[] = []
    const reader = stream.readable.getReader()

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

/**
 * Execute the stream pipeline
 * (for when you don't need to collect results).
 */
export async function run<T> (stream:PipeableStream<T, any>):Promise<void> {
    const reader = stream.readable.getReader()
    try {
        while (true) {
            const { done } = await reader.read()
            if (done) break
        }
    } finally {
        reader.releaseLock()
    }
}

/**
 * Create a filter transform. Like Array.filter, but for streams.
 */
export function filter<T> (
    predicate:(item:T) => boolean|Promise<boolean>
):PipeableStream<T, T> {
    return transform<T, T>({
        async transform (
            chunk:T,
            controller:TransformStreamDefaultController<T>
        ) {
            if (await predicate(chunk)) {
                controller.enqueue(chunk)
            }
            // Don't enqueue if predicate is falsy
        },
    })
}

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

    /** Like reduce, but emits each intermediate accumulated value. */
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

    /** Get the underlying PipeableStream. */
    toPipeableStream():PipeableStream<T, never>;
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
        return createEnhanced(readable)
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

function createEnhanced<U> (r:ReadableStream<U>):EnhancedStream<U> {
    return {
        readable: r,

        map<V> (fn:(item:U) => V|Promise<V>):EnhancedStream<V> {
            const ts = new TransformStream<U, V>({
                async transform (chunk:U, controller:TransformStreamDefaultController<V>) {
                    controller.enqueue(await fn(chunk))
                },
            })
            return createEnhanced(r.pipeThrough(ts))
        },

        filter (predicate:(item:U) => boolean|Promise<boolean>):EnhancedStream<U> {
            const ts = new TransformStream<U, U>({
                async transform (chunk:U, controller:TransformStreamDefaultController<U>) {
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

        toPipeableStream ():PipeableStream<U, never> {
            return Stream(r)
        },
    }
}
