/**
 * SSH Tunnel Configuration Types
 */

export interface SSHTunnelConfig {
  /** SSH server hostname */
  host: string;
  
  /** SSH server port (default: 22) */
  port?: number;
  
  /** SSH username */
  username: string;
  
  /** SSH password (for password authentication) */
  password?: string;
  
  /** Path to SSH private key file */
  privateKey?: string;
  
  /** Passphrase for SSH private key */
  passphrase?: string;
}

export interface SSHTunnelOptions {
  /** Target database host (as seen from SSH server) */
  targetHost: string;
  
  /** Target database port */
  targetPort: number;
  
  /** Local port to bind the tunnel (0 for dynamic allocation) */
  localPort?: number;
}

export interface SSHTunnelInfo {
  /** Local port where the tunnel is listening */
  localPort: number;
  
  /** Original target host */
  targetHost: string;
  
  /** Original target port */
  targetPort: number;
}