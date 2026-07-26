import { describe, expect, it } from 'vitest';

import { detectConfigVersion } from '../../src/core/configVersion.js';

describe('detectConfigVersion', () => {
  describe('v1', () => {
    it('recognizes the shape of a real v1 config', () => {
      // tauri-apps/tauri examples/helloworld @ tauri-v1.8.3
      const config = {
        $schema: '../../core/tauri-config-schema/schema.json',
        build: { distDir: ['index.html'], devPath: ['index.html'] },
        package: { productName: 'Hello World', version: '0.1.0' },
        tauri: {
          allowlist: { all: false },
          security: { csp: "default-src 'self'" },
        },
      };
      expect(detectConfigVersion(config).version).toBe('v1');
    });

    it('recognizes a v1 config that has no `tauri` key at all', () => {
      expect(
        detectConfigVersion({
          build: { distDir: '../dist', devPath: 'http://localhost:5173' },
          package: { productName: 'demo' },
        }).version,
      ).toBe('v1');
    });

    it('treats `tauri.allowlist` as a v1 marker', () => {
      const verdict = detectConfigVersion({ tauri: { allowlist: { all: true } } });
      expect(verdict.version).toBe('v1');
      expect(verdict.signals.v1).toContain('`tauri.allowlist` (v1 opt-in API model)');
    });
  });

  describe('v2', () => {
    it('recognizes the shape of a real v2 config', () => {
      const config = {
        $schema: 'https://schema.tauri.app/config/2',
        productName: 'Surrealist',
        version: '2.4.0',
        identifier: 'com.surrealdb.surrealist',
        build: { frontendDist: '../dist', devUrl: 'http://localhost:1420' },
        app: { security: { csp: null } },
      };
      expect(detectConfigVersion(config).version).toBe('v2');
    });

    it('recognizes a minimal v2 config by identifier alone', () => {
      expect(detectConfigVersion({ identifier: 'com.example.app' }).version).toBe('v2');
    });

    it('recognizes a v2 platform overlay carrying only `app`', () => {
      expect(detectConfigVersion({ app: { windows: [{ title: 'x' }] } }).version).toBe('v2');
    });
  });

  describe('unknown — never guessed', () => {
    it('refuses to place a document that mixes both generations', () => {
      const verdict = detectConfigVersion({
        tauri: { allowlist: { all: true } },
        app: { security: { csp: null } },
      });
      expect(verdict.version).toBe('unknown');
      expect(verdict.reason).toContain('mixes v1 and v2 markers');
      // Both signal sets are retained so the warning can explain itself.
      expect(verdict.signals.v1.length).toBeGreaterThan(0);
      expect(verdict.signals.v2.length).toBeGreaterThan(0);
    });

    it('refuses a document with no recognizable markers', () => {
      expect(detectConfigVersion({ productName: 'demo' }).version).toBe('unknown');
      expect(detectConfigVersion({}).version).toBe('unknown');
    });

    it('refuses non-object roots without throwing', () => {
      for (const value of [null, undefined, 42, 'string', [], [{ app: {} }]]) {
        expect(detectConfigVersion(value).version).toBe('unknown');
      }
    });

    it('does not let a v1 rule reach a v2 config through a shared key name', () => {
      // Both generations have `security.freezePrototype`, at different paths.
      // The v2 document must not be readable as v1 just because the name matches.
      const v2 = { app: { security: { freezePrototype: false } } };
      expect(detectConfigVersion(v2).version).toBe('v2');
      expect(detectConfigVersion(v2).signals.v1).toEqual([]);
    });
  });
});
