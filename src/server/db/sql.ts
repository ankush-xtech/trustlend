import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * Fully-qualified column reference ("table"."column") for use inside correlated subqueries.
 * In single-table selects Drizzle renders `${table.column}` unqualified, which inside a subquery would
 * bind to the subquery's own table (e.g. `la.customer_id = "id"` resolving to `la.id`).
 */
export function qcol(column: Column) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}
