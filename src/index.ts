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
