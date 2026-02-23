export interface FileHandleLike {
    write (
        buffer:Uint8Array,
        offset:number,
        length:number,
        position:number
    ):Promise<{ bytesWritten:number }>;
    truncate (len?:number):Promise<void>;
    close ():Promise<void>;
}

/**
 * Convert a Node file handle into a writable web stream.
 */
export function toFileSink (
    fh:FileHandleLike
):WritableStream<Uint8Array> {
    let position = 0

    return new WritableStream<Uint8Array>({
        async write (chunk) {
            let offset = 0

            while (offset < chunk.byteLength) {
                const { bytesWritten } = await fh.write(
                    chunk,
                    offset,
                    chunk.byteLength - offset,
                    position
                )

                if (bytesWritten <= 0) {
                    throw new Error('Expected file handle write to advance.')
                }

                offset += bytesWritten
                position += bytesWritten
            }
        },

        async close () {
            await fh.truncate(position)
            await fh.close()
        },

        async abort () {
            await fh.close()
        }
    })
}
