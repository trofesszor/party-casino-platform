import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';

@Injectable()
export class AdminService {
  private readonly sessions = new Map<string, number>();

  login(passwordInput: string) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPassword) throw new ServiceUnavailableException('ADMIN_PASSWORD nincs beállítva a backend .env fájlban.');
    const supplied = Buffer.from(String(passwordInput ?? ''));
    const expected = Buffer.from(configuredPassword);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Hibás admin jelszó.');
    }
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
    return { token, expiresIn: 43200 };
  }

  assertToken(token: string | undefined) {
    if (!token) throw new UnauthorizedException('Admin bejelentkezés szükséges.');
    const expiresAt = this.sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      this.sessions.delete(token);
      throw new UnauthorizedException('Az admin munkamenet lejárt.');
    }
  }

  logout(token: string | undefined) {
    if (token) this.sessions.delete(token);
    return { success: true };
  }
}
