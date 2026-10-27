// PKCE helpers — code_verifier / code_challenge generation using the Web Crypto API.

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function randomString(length = 64) {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return base64UrlEncode(array.buffer).slice(0, length)
}

export async function sha256(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return crypto.subtle.digest('SHA-256', data)
}

export async function generatePkcePair() {
  const codeVerifier = randomString(64)
  const digest = await sha256(codeVerifier)
  const codeChallenge = base64UrlEncode(digest)
  return { codeVerifier, codeChallenge }
}
