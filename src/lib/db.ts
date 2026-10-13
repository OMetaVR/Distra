// SQLite through the tweak (Documents/Discordia/db/<name>.sqlite). Snowflakes should be
// passed as strings; the native side stores them as 64-bit integers and returns
// values beyond JS's safe integer range as strings.

import { callNative } from "@/core/bridge";

type Param = string | number | boolean | null;
type QueryResult = { columns: string[]; rows: unknown[][] };
type RunResult = { changes: number; lastInsertRowId: number };

export interface Database {
    /** Runs a statement that returns no rows. */
    run(sql: string, params?: Param[]): Promise<RunResult>;
    /** Runs a query and returns rows as objects keyed by column name. */
    all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
    /** Runs statements in one transaction. */
    batch(statements: Array<[string, Param[]?]>): Promise<unknown[]>;
    /** Size on disk in bytes (including the write-ahead log). */
    size(): Promise<number>;
}

export function openDatabase(name: string): Database {
    return {
        run: (sql, params = []) => callNative<RunResult>("db.exec", name, sql, params),
        async all<T>(sql: string, params: Param[] = []) {
            const result = await callNative<QueryResult>("db.exec", name, sql, params);
            return result.rows.map(row => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])) as T);
        },
        batch: statements => callNative<unknown[]>("db.batch", name, statements.map(([sql, params]) => [sql, params ?? []])),
        size: () => callNative<number>("db.size", name),
    };
}
