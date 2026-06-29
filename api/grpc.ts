// gRPC/Connect Vercel function. A default export is the Node (req, res) handler shape
// Vercel expects, which is exactly what connectNodeAdapter returns. vercel.json routes
// the RPC paths (/user.v1.UserService/*) here. Connect + gRPC-Web work over HTTP/1.1;
// native binary gRPC needs HTTP/2 and is not reachable on Vercel functions.
export { default } from '../src/adapters/vercel-grpc.js'
