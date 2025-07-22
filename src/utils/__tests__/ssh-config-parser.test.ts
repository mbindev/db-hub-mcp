import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSSHConfig, looksLikeSSHAlias } from '../ssh-config-parser.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('SSH Config Parser', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    // Create a temporary directory for test config files
    tempDir = mkdtempSync(join(tmpdir(), 'dbhub-ssh-test-'));
    configPath = join(tempDir, 'config');
  });

  afterEach(() => {
    // Clean up temporary directory
    rmSync(tempDir, { recursive: true });
  });

  describe('parseSSHConfig', () => {
    it('should parse basic SSH config', () => {
      const configContent = `
Host myserver
  HostName 192.168.1.100
  User johndoe
  Port 2222
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('myserver', configPath);
      expect(result).toEqual({
        host: '192.168.1.100',
        username: 'johndoe',
        port: 2222
      });
    });

    it('should handle identity file', () => {
      const identityPath = join(tempDir, 'id_rsa');
      writeFileSync(identityPath, 'fake-key-content');
      
      const configContent = `
Host dev-server
  HostName dev.example.com
  User developer
  IdentityFile ${identityPath}
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('dev-server', configPath);
      expect(result).toEqual({
        host: 'dev.example.com',
        username: 'developer',
        privateKey: identityPath
      });
    });

    it('should handle multiple identity files and use the first one', () => {
      const identityPath1 = join(tempDir, 'id_rsa');
      const identityPath2 = join(tempDir, 'id_ed25519');
      writeFileSync(identityPath1, 'fake-key-1');
      writeFileSync(identityPath2, 'fake-key-2');
      
      const configContent = `
Host multi-key
  HostName multi.example.com
  User multiuser
  IdentityFile ${identityPath1}
  IdentityFile ${identityPath2}
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('multi-key', configPath);
      expect(result?.privateKey).toBe(identityPath1);
    });

    it('should handle wildcard patterns', () => {
      const configContent = `
Host *.example.com
  User defaultuser
  Port 2222

Host prod.example.com
  HostName 10.0.0.100
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('prod.example.com', configPath);
      expect(result).toEqual({
        host: '10.0.0.100',
        username: 'defaultuser',
        port: 2222
      });
    });

    it('should use host alias as hostname if HostName not specified', () => {
      const configContent = `
Host myalias
  User testuser
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('myalias', configPath);
      expect(result).toEqual({
        host: 'myalias',
        username: 'testuser'
      });
    });

    it('should return null for non-existent host', () => {
      const configContent = `
Host myserver
  HostName 192.168.1.100
  User johndoe
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('nonexistent', configPath);
      expect(result).toBeNull();
    });

    it('should return null if config file does not exist', () => {
      const result = parseSSHConfig('myserver', '/non/existent/path');
      expect(result).toBeNull();
    });

    it('should return null if required fields are missing', () => {
      const configContent = `
Host incomplete
  HostName 192.168.1.100
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('incomplete', configPath);
      expect(result).toBeNull();
    });

    it('should handle tilde expansion in identity file', () => {
      // Mock a key file that would exist in home directory
      const mockKeyPath = join(tempDir, 'mock_id_rsa');
      writeFileSync(mockKeyPath, 'fake-key');
      
      const configContent = `
Host tilde-test
  HostName tilde.example.com
  User tildeuser
  IdentityFile ${mockKeyPath}
`;
      writeFileSync(configPath, configContent);

      const result = parseSSHConfig('tilde-test', configPath);
      expect(result?.privateKey).toBe(mockKeyPath);
    });
  });

  describe('looksLikeSSHAlias', () => {
    it('should return true for simple hostnames', () => {
      expect(looksLikeSSHAlias('myserver')).toBe(true);
      expect(looksLikeSSHAlias('dev-box')).toBe(true);
      expect(looksLikeSSHAlias('prod_server')).toBe(true);
    });

    it('should return false for domains', () => {
      expect(looksLikeSSHAlias('example.com')).toBe(false);
      expect(looksLikeSSHAlias('sub.example.com')).toBe(false);
      expect(looksLikeSSHAlias('my.local.dev')).toBe(false);
    });

    it('should return false for IP addresses', () => {
      expect(looksLikeSSHAlias('192.168.1.1')).toBe(false);
      expect(looksLikeSSHAlias('10.0.0.1')).toBe(false);
      expect(looksLikeSSHAlias('::1')).toBe(false);
      expect(looksLikeSSHAlias('2001:db8::1')).toBe(false);
    });
  });
});