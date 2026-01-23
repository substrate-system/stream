/**
 * A nicer API for browser TransformStream with proper backpressure handling
 */

interface PipeableStream<R = any, W = any> {
    readable:ReadableStream<R>;
    writable:WritableStream<W>;
    pipe<T>(next:PipeableStream<T, R>):PipeableStream<T, W>;
    pipeTo(destination:WritableStream<R>):Promise<void>;
}

interface TransformFunction<I, O> {
    (chunk:I):O|Promise<O>;
}

/**
 * Wraps a ReadableStream to make it pipeable
 */
export function source<R> (readable:ReadableStream<R>):PipeableStream<R, never> {
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
                pipe<U> (another: PipeableStream<U, T>): PipeableStream<U, never> {
                    return source(pipedReadable).pipe(another)
                },
                async pipeTo (destination: WritableStream<T>) {
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
 * Wraps a WritableStream to make it pipeable
 */
export function sink<W> (writable:WritableStream<W>):PipeableStream<never, W> {
    return {
        readable: null as any,
        writable,
        pipe (): never {
            throw new Error('Cannot pipe from a sink stream')
        },
        async pipeTo (): Promise<void> {
            throw new Error('Cannot pipeTo from a sink stream')
        },
    }
}

/**
 * Creates a transform stream with a simple function
 * Similar to through2 for Node.js
 */
export function through<I, O> (
    transformFn:TransformFunction<I, O>,
    flushFn?:() => void | Promise<void>
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
                pipe<U> (another: PipeableStream<U, T>): PipeableStream<U, I> {
                    const furtherPiped = pipedReadable.pipeThrough({
                        readable: another.readable,
                        writable: another.writable,
                    })
                    return {
                        readable: furtherPiped,
                        writable: transformStream.writable,
                        pipe: source(furtherPiped).pipe.bind(source(furtherPiped)),
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
 * Creates a transform stream with more control
 */
export function transform<I, O> (
    transformer:Transformer<I, O>
):PipeableStream<O, I> {
    const transformStream = new TransformStream<I, O>(transformer)

    return {
        readable: transformStream.readable,
        writable: transformStream.writable,
        pipe<T> (next: PipeableStream<T, O>): PipeableStream<T, I> {
            const pipedReadable = this.readable.pipeThrough({
                readable: next.readable,
                writable: next.writable,
            })

            return {
                readable: pipedReadable,
                writable: transformStream.writable,
                pipe<U> (another: PipeableStream<U, T>): PipeableStream<U, I> {
                    const furtherPiped = pipedReadable.pipeThrough({
                        readable: another.readable,
                        writable: another.writable,
                    })
                    return {
                        readable: furtherPiped,
                        writable: transformStream.writable,
                        pipe: source(furtherPiped).pipe.bind(source(furtherPiped)),
                        pipeTo: (dest) => furtherPiped.pipeTo(dest),
                    }
                },
                async pipeTo (destination: WritableStream<T>) {
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

    return source(readable)
}

/**
 * Helper to collect all values from a stream into an array
 * This will respect backpressure since we read one chunk at a time
 */
export async function collect<T> (stream:PipeableStream<T, any>):Promise<T[]> {
    const results: T[] = []
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
 * Execute the stream pipeline (when you don't need to collect results)
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
