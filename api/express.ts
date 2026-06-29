// Express Vercel function. A default export is the Node (req, res) handler shape Vercel
// expects, which is what an Express app is. vercel.json routes /express/* here; the
// adapter mounts the app under that prefix so the preserved path matches.
export { default } from '../src/adapters/vercel-express.js'
