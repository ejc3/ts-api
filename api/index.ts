// Vercel routes filesystem paths under api/ to functions. This file is the function;
// the entry logic lives in the reviewed src/adapters layer. vercel.json rewrites every
// non-gRPC, non-Express path here, and the Hono app routes on the original URL. The
// named HTTP-method exports tell Vercel to invoke the Web fetch handler (a default
// export would be treated as a Node (req, res) function and its Response ignored).
export { DELETE, GET, PATCH, POST, PUT } from '../src/adapters/vercel.js'
