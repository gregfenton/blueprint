// TODO: Turn this into a class, Serialization, that can be instantiated with a map of contentType to serialize/deserialize functions.

// 3rd party imports
import { Encoder, decode } from 'cbor-x'

// local imports
import { HTTPError } from './http-error.js'

// iniialize imports
const cborSC = new Encoder({ structuredClone: true })

export async function deserialize(request, contentType) {  // TODO: Take a contentType argument
  try {
    const ab = await request.arrayBuffer()
    const u8a = new Uint8Array(ab)
    // const o = cborSC.decode(u8a)
    const o = decode(u8a)
    return o
  } catch (e) {
    throw new HTTPError('Error decoding your supplied body. Encode with npm package cbor-x using structured clone extension.', 415)
  }
}

export function serialize(o, contentType) {  // TODO: Take a contentType argument
  try {
    const u8a = cborSC.encode(o)
    return u8a
  } catch (e) {
    throw new HTTPError(`Error encoding the supplied body: ${e.message}`, 500)
  }
}
