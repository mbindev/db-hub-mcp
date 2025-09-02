/**
 * Shared utility for applying row limits to SELECT queries only using database-native LIMIT clauses
 */
export class SQLRowLimiter {
  /**
   * Check if a SQL statement is a SELECT query that can benefit from row limiting
   * Only handles SELECT queries
   */
  static isSelectQuery(sql: string): boolean {
    const trimmed = sql.trim().toLowerCase();
    return trimmed.startsWith('select');
  }

  /**
   * Check if a SQL statement already has a LIMIT clause
   */
  static hasLimitClause(sql: string): boolean {
    // Simple regex to detect LIMIT clause - handles most common cases
    const limitRegex = /\blimit\s+\d+/i;
    return limitRegex.test(sql);
  }

  /**
   * Check if a SQL statement already has a TOP clause (SQL Server)
   */
  static hasTopClause(sql: string): boolean {
    // Simple regex to detect TOP clause - handles most common cases
    const topRegex = /\bselect\s+top\s+\d+/i;
    return topRegex.test(sql);
  }

  /**
   * Extract existing LIMIT value from SQL if present
   */
  static extractLimitValue(sql: string): number | null {
    const limitMatch = sql.match(/\blimit\s+(\d+)/i);
    if (limitMatch) {
      return parseInt(limitMatch[1], 10);
    }
    return null;
  }

  /**
   * Extract existing TOP value from SQL if present (SQL Server)
   */
  static extractTopValue(sql: string): number | null {
    const topMatch = sql.match(/\bselect\s+top\s+(\d+)/i);
    if (topMatch) {
      return parseInt(topMatch[1], 10);
    }
    return null;
  }

  /**
   * Add or modify LIMIT clause in a SQL statement
   */
  static applyLimitToQuery(sql: string, maxRows: number): string {
    const existingLimit = this.extractLimitValue(sql);
    
    if (existingLimit !== null) {
      // Use the minimum of existing limit and maxRows
      const effectiveLimit = Math.min(existingLimit, maxRows);
      return sql.replace(/\blimit\s+\d+/i, `LIMIT ${effectiveLimit}`);
    } else {
      // Add LIMIT clause to the end of the query
      // Handle semicolon at the end
      const trimmed = sql.trim();
      const hasSemicolon = trimmed.endsWith(';');
      const sqlWithoutSemicolon = hasSemicolon ? trimmed.slice(0, -1) : trimmed;
      
      return `${sqlWithoutSemicolon} LIMIT ${maxRows}${hasSemicolon ? ';' : ''}`;
    }
  }

  /**
   * Add or modify TOP clause in a SQL statement (SQL Server)
   */
  static applyTopToQuery(sql: string, maxRows: number): string {
    const existingTop = this.extractTopValue(sql);
    
    if (existingTop !== null) {
      // Use the minimum of existing top and maxRows
      const effectiveTop = Math.min(existingTop, maxRows);
      return sql.replace(/\bselect\s+top\s+\d+/i, `SELECT TOP ${effectiveTop}`);
    } else {
      // Add TOP clause after SELECT
      return sql.replace(/\bselect\s+/i, `SELECT TOP ${maxRows} `);
    }
  }

  /**
   * Apply maxRows limit to a SELECT query only
   */
  static applyMaxRows(sql: string, maxRows: number | undefined): string {
    if (!maxRows || !this.isSelectQuery(sql)) {
      return sql;
    }
    return this.applyLimitToQuery(sql, maxRows);
  }

  /**
   * Apply maxRows limit to a SELECT query using SQL Server TOP syntax
   */
  static applyMaxRowsForSQLServer(sql: string, maxRows: number | undefined): string {
    if (!maxRows || !this.isSelectQuery(sql)) {
      return sql;
    }
    return this.applyTopToQuery(sql, maxRows);
  }
}