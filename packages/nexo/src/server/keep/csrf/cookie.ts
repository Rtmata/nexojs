import { cookieValue } from '../../../shared/http/cookie'
import { PLAIN_COOKIE, SECURE_COOKIE } from './vocabulary'

/**
 * The cookie the token lives in. `__Host-` needs `Secure`, which browsers
 * grant to HTTPS and to `localhost`, not to a LAN address in development:
 * there, a plain cookie carries it.
 */
export class TokenCookie {
  readonly name: string

  constructor(private readonly secure: boolean) {
    this.name = secure ? SECURE_COOKIE : PLAIN_COOKIE
  }

  static for(url: URL): TokenCookie {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    return new TokenCookie(url.protocol === 'https:' || local)
  }

  /** The token the request brought in this cookie, if any. */
  read(request: Request): string | null {
    return cookieValue(request, this.name) || null
  }

  /** A `Set-Cookie` value: for the whole site, this browser session, never readable by scripts, sent on same-site navigations. */
  write(token: string): string {
    const secure = this.secure ? '; Secure' : ''
    return `${this.name}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`
  }
}
