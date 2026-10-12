/** Static hosts may serve .gz as a compressed response or as a gzip file.
 * Fetch already decodes Content-Encoding; inspect the payload to avoid decoding twice.
 */
export async function decodeModelResponse(response:Response,expectedBytes:number,compressed:boolean):Promise<ArrayBuffer>{
 if(!response.ok)throw new Error('An anatomy file could not be loaded.');
 const payload=await response.arrayBuffer(),signature=new Uint8Array(payload,0,Math.min(2,payload.byteLength));
 const gzip=compressed&&signature[0]===0x1f&&signature[1]===0x8b;
 const buffer=gzip?await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():payload;
 if(buffer.byteLength!==expectedBytes)throw new Error('An anatomy file was incomplete. Please reload the viewer.');
 return buffer;
}

/** Keep downloads bounded, and stop the entire queue on failure or a model switch. */
export async function loadModelChunks(
 count: number,
 load: (index: number, signal: AbortSignal) => Promise<void>,
 signal: AbortSignal,
): Promise<void> {
 signal.throwIfAborted();
 const controller = new AbortController();
 const cancel = () => controller.abort(signal.reason);
 signal.addEventListener('abort', cancel, { once: true });
 let next = 0;
 try {
  await Promise.all(Array.from({ length: Math.min(3, count) }, async () => {
   while (!controller.signal.aborted && next < count) {
    await load(next++, controller.signal);
   }
  }));
  signal.throwIfAborted();
 } catch (error) {
  controller.abort(error);
  throw error;
 } finally {
  signal.removeEventListener('abort', cancel);
 }
}
