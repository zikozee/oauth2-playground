// Local JWT decode + signature verification (against a JWKS) — for teaching purposes.

function base64UrlDecode(input) {
  let str = input.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return decodeURIComponent(
    atob(str)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  )
}

function base64UrlToBytes(input) {
  let str = input.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function decodeJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return {
      header: JSON.parse(base64UrlDecode(parts[0])),
      payload: JSON.parse(base64UrlDecode(parts[1])),
      signature: parts[2],
    }
  } catch {
    return null
  }
}

// Verifies an RS256-signed JWT against an imported CryptoKey (see services/jwks.js).
export async function verifyJwtSignature(token, cryptoKey) {
  const [headerB64, payloadB64, signatureB64] = token.split('.')
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64UrlToBytes(signatureB64)
  return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, signature, data)
}
