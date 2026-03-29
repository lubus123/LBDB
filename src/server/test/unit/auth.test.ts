import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, cleanDb, teardownTestDb } from '../helpers/db';
import { register, login, validateToken, logout } from '../../auth';

describe('Auth', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  describe('register', () => {
    it('creates a user and returns token', async () => {
      const result = await register('alice', 'password123');
      expect(result).not.toHaveProperty('error');
      if ('error' in result) return;
      expect(result.user.username).toBe('alice');
      expect(result.token).toBeTruthy();
      expect(result.token.length).toBe(64);
    });

    it('rejects short username', async () => {
      const result = await register('a', 'password123');
      expect(result).toHaveProperty('error');
    });

    it('rejects long username', async () => {
      const result = await register('a'.repeat(21), 'password123');
      expect(result).toHaveProperty('error');
    });

    it('rejects short password', async () => {
      const result = await register('alice', '123');
      expect(result).toHaveProperty('error');
    });

    it('rejects special characters in username', async () => {
      const result = await register('ali ce!', 'password123');
      expect(result).toHaveProperty('error');
    });

    it('rejects duplicate username', async () => {
      await register('alice', 'password123');
      const result = await register('Alice', 'password456');
      expect(result).toHaveProperty('error');
      if ('error' in result) {
        expect(result.error).toContain('taken');
      }
    });

    it('stores username lowercase', async () => {
      const result = await register('Alice', 'password123');
      expect(result).not.toHaveProperty('error');
      if ('error' in result) return;
      expect(result.user.username).toBe('alice');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register('alice', 'password123');
    });

    it('succeeds with correct credentials', async () => {
      const result = await login('alice', 'password123');
      expect(result).not.toHaveProperty('error');
      if ('error' in result) return;
      expect(result.user.username).toBe('alice');
      expect(result.token).toBeTruthy();
    });

    it('is case-insensitive for username', async () => {
      const result = await login('Alice', 'password123');
      expect(result).not.toHaveProperty('error');
    });

    it('rejects wrong password', async () => {
      const result = await login('alice', 'wrongpassword');
      expect(result).toHaveProperty('error');
    });

    it('rejects nonexistent user', async () => {
      const result = await login('nobody', 'password123');
      expect(result).toHaveProperty('error');
    });
  });

  describe('validateToken', () => {
    it('returns user for valid token', async () => {
      const reg = await register('alice', 'password123');
      if ('error' in reg) throw new Error(reg.error);

      const user = await validateToken(reg.token);
      expect(user).not.toBeNull();
      expect(user!.username).toBe('alice');
      expect(user!.id).toBe(reg.user.id);
    });

    it('returns null for invalid token', async () => {
      const user = await validateToken('totally-invalid-token');
      expect(user).toBeNull();
    });

    it('returns null for empty token', async () => {
      const user = await validateToken('');
      expect(user).toBeNull();
    });
  });

  describe('logout', () => {
    it('invalidates the token', async () => {
      const reg = await register('alice', 'password123');
      if ('error' in reg) throw new Error(reg.error);

      await logout(reg.token);
      const user = await validateToken(reg.token);
      expect(user).toBeNull();
    });
  });
});
