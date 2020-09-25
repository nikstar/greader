export default function sanitize(s: string): string {
  let r = s.replace("<", "%lt;")
  r = r.replace(">", "&gt;")
  return r
}