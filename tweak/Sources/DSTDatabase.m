// SQLite for JS (bridge methods `db.*`). Databases live in Documents/Distra/db/<name>.sqlite;
// each has a serial queue, a cached connection and cached prepared statements.
// Used by the message logger, available to plugins through the Distra API.

#import "Distra.h"
#import <sqlite3.h>

@interface DSTDatabase : NSObject
@property (nonatomic) sqlite3 *handle;
@property (nonatomic, strong) dispatch_queue_t queue;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSValue *> *statements;
@end

@implementation DSTDatabase

- (void)dealloc {
    for (NSValue *value in self.statements.allValues) sqlite3_finalize(value.pointerValue);
    if (_handle) sqlite3_close_v2(_handle);
}

@end

static NSMutableDictionary<NSString *, DSTDatabase *> *DSTOpenDatabases(void) {
    static NSMutableDictionary *databases;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ databases = [NSMutableDictionary dictionary]; });
    return databases;
}

static DSTDatabase *DSTDatabaseNamed(NSString *name, NSString **error) {
    if (![name isKindOfClass:NSString.class] || ![[NSPredicate predicateWithFormat:@"SELF MATCHES %@", @"^[A-Za-z0-9_-]{1,64}$"] evaluateWithObject:name]) {
        *error = @"Invalid database name";
        return nil;
    }

    @synchronized (DSTOpenDatabases()) {
        DSTDatabase *database = DSTOpenDatabases()[name];
        if (database) return database;

        NSURL *directory = [DSTRootURL() URLByAppendingPathComponent:@"db" isDirectory:YES];
        [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
        NSString *path = [directory URLByAppendingPathComponent:[name stringByAppendingString:@".sqlite"]].path;

        sqlite3 *handle = NULL;
        if (sqlite3_open_v2(path.fileSystemRepresentation, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX, NULL) != SQLITE_OK) {
            *error = [NSString stringWithFormat:@"Could not open database: %s", handle ? sqlite3_errmsg(handle) : "unknown"];
            if (handle) sqlite3_close_v2(handle);
            return nil;
        }
        // Small, crash-safe defaults for a phone: WAL, incremental vacuum, modest cache.
        sqlite3_exec(handle, "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA auto_vacuum=INCREMENTAL; PRAGMA cache_size=-1024; PRAGMA foreign_keys=ON;", NULL, NULL, NULL);
        sqlite3_busy_timeout(handle, 2000);

        database = [DSTDatabase new];
        database.handle = handle;
        database.queue = dispatch_queue_create([[@"dev.distra.db." stringByAppendingString:name] UTF8String], DISPATCH_QUEUE_SERIAL);
        database.statements = [NSMutableDictionary dictionary];
        DSTOpenDatabases()[name] = database;
        DSTLogNative(@"Opened database %@", name);
        return database;
    }
}

static sqlite3_stmt *DSTPrepare(DSTDatabase *database, NSString *sql, NSString **error) {
    NSValue *cached = database.statements[sql];
    if (cached) {
        sqlite3_stmt *statement = cached.pointerValue;
        sqlite3_reset(statement);
        sqlite3_clear_bindings(statement);
        return statement;
    }
    sqlite3_stmt *statement = NULL;
    if (sqlite3_prepare_v3(database.handle, sql.UTF8String, -1, SQLITE_PREPARE_PERSISTENT, &statement, NULL) != SQLITE_OK) {
        *error = @(sqlite3_errmsg(database.handle));
        return NULL;
    }
    if (database.statements.count > 64) {
        for (NSValue *value in database.statements.allValues) sqlite3_finalize(value.pointerValue);
        [database.statements removeAllObjects];
    }
    database.statements[sql] = [NSValue valueWithPointer:statement];
    return statement;
}

/** Binds JS values: numbers (integers bind as int64), strings, booleans, null. */
static BOOL DSTBind(sqlite3_stmt *statement, NSArray *params, NSString **error) {
    if (![params isKindOfClass:NSArray.class]) return YES;
    for (NSUInteger i = 0; i < params.count; i++) {
        id value = params[i];
        int index = (int)i + 1;
        int result;
        if (value == NSNull.null) {
            result = sqlite3_bind_null(statement, index);
        } else if ([value isKindOfClass:NSString.class]) {
            result = sqlite3_bind_text(statement, index, [value UTF8String], -1, SQLITE_TRANSIENT);
        } else if ([value isKindOfClass:NSNumber.class]) {
            NSNumber *number = value;
            const char *type = number.objCType;
            BOOL integral = strcmp(type, @encode(double)) != 0 && strcmp(type, @encode(float)) != 0;
            if (!integral) integral = number.doubleValue == floor(number.doubleValue) && fabs(number.doubleValue) < 9007199254740992.0;
            result = integral ? sqlite3_bind_int64(statement, index, number.longLongValue) : sqlite3_bind_double(statement, index, number.doubleValue);
        } else {
            *error = [NSString stringWithFormat:@"Unsupported parameter type at %lu", (unsigned long)i];
            return NO;
        }
        if (result != SQLITE_OK) {
            *error = [NSString stringWithFormat:@"Could not bind parameter %lu", (unsigned long)i];
            return NO;
        }
    }
    return YES;
}

static id DSTColumnValue(sqlite3_stmt *statement, int column) {
    switch (sqlite3_column_type(statement, column)) {
        case SQLITE_INTEGER: {
            sqlite3_int64 value = sqlite3_column_int64(statement, column);
            // Snowflakes don't fit in a JS number; return large integers as strings.
            if (llabs(value) > 9007199254740991LL) return [NSString stringWithFormat:@"%lld", value];
            return @(value);
        }
        case SQLITE_FLOAT: return @(sqlite3_column_double(statement, column));
        case SQLITE_TEXT: return @((const char *)sqlite3_column_text(statement, column));
        case SQLITE_NULL: return NSNull.null;
        default: return NSNull.null;
    }
}

/**
 * Runs one statement. Returns { columns, rows } for queries (rows are arrays),
 * { changes, lastInsertRowId } otherwise.
 */
static NSDictionary *DSTRun(DSTDatabase *database, NSString *sql, NSArray *params, NSString **error) {
    sqlite3_stmt *statement = DSTPrepare(database, sql, error);
    if (!statement || !DSTBind(statement, params, error)) return nil;

    int columnCount = sqlite3_column_count(statement);
    NSMutableArray *rows = [NSMutableArray array];
    int step;
    while ((step = sqlite3_step(statement)) == SQLITE_ROW) {
        NSMutableArray *row = [NSMutableArray arrayWithCapacity:columnCount];
        for (int c = 0; c < columnCount; c++) [row addObject:DSTColumnValue(statement, c)];
        [rows addObject:row];
    }
    if (step != SQLITE_DONE) {
        *error = @(sqlite3_errmsg(database.handle));
        sqlite3_reset(statement);
        return nil;
    }
    sqlite3_reset(statement);

    if (columnCount > 0) {
        NSMutableArray *columns = [NSMutableArray array];
        for (int c = 0; c < columnCount; c++) [columns addObject:@(sqlite3_column_name(statement, c))];
        return @{ @"columns": columns, @"rows": rows };
    }
    return @{ @"changes": @(sqlite3_changes(database.handle)), @"lastInsertRowId": @(sqlite3_last_insert_rowid(database.handle)) };
}

void DSTDatabaseExecute(NSString *name, NSString *sql, NSArray *params, void (^done)(id result, NSString *error)) {
    NSString *error;
    DSTDatabase *database = DSTDatabaseNamed(name, &error);
    if (!database) return done(nil, error);
    if (![sql isKindOfClass:NSString.class]) return done(nil, @"SQL must be a string");
    dispatch_async(database.queue, ^{
        NSString *runError;
        NSDictionary *result = DSTRun(database, sql, params, &runError);
        done(result, runError);
    });
}

/** Runs several statements in one transaction: [[sql, params], ...]. Rolls back on the first error. */
void DSTDatabaseBatch(NSString *name, NSArray *statements, void (^done)(id result, NSString *error)) {
    NSString *error;
    DSTDatabase *database = DSTDatabaseNamed(name, &error);
    if (!database) return done(nil, error);
    if (![statements isKindOfClass:NSArray.class]) return done(nil, @"Batch must be an array");
    dispatch_async(database.queue, ^{
        sqlite3_exec(database.handle, "BEGIN IMMEDIATE", NULL, NULL, NULL);
        NSMutableArray *results = [NSMutableArray array];
        for (NSArray *entry in statements) {
            if (![entry isKindOfClass:NSArray.class] || entry.count < 1) continue;
            NSString *runError;
            NSDictionary *result = DSTRun(database, entry[0], entry.count > 1 ? entry[1] : @[], &runError);
            if (!result) {
                sqlite3_exec(database.handle, "ROLLBACK", NULL, NULL, NULL);
                return done(nil, runError);
            }
            [results addObject:result];
        }
        sqlite3_exec(database.handle, "COMMIT", NULL, NULL, NULL);
        done(results, nil);
    });
}

/** File size of a database (including WAL), for storage displays. */
NSNumber *DSTDatabaseSize(NSString *name) {
    NSURL *directory = [DSTRootURL() URLByAppendingPathComponent:@"db" isDirectory:YES];
    unsigned long long total = 0;
    for (NSString *suffix in @[@".sqlite", @".sqlite-wal", @".sqlite-shm"]) {
        NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:[directory URLByAppendingPathComponent:[name stringByAppendingString:suffix]].path error:nil];
        total += attributes.fileSize;
    }
    return @(total);
}
