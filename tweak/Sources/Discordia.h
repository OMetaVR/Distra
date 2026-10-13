#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <os/log.h>

#ifndef DISCORDIA_TWEAK_VERSION
#define DISCORDIA_TWEAK_VERSION "0.0.0"
#endif

#ifndef DISCORDIA_INSTALL_PREFIX
#define DISCORDIA_INSTALL_PREFIX ""
#endif

#define DCDLoaderName @"DiscordiaTweak"
#define DCDLoaderVersion @DISCORDIA_TWEAK_VERSION

/** URL scheme of scripts the tweak evaluates; anything else is Discord's. */
#define DCDScriptScheme @"discordia"

os_log_t DCDLog(void);

#pragma mark - Paths (DCDPaths.m)

/** Documents/Discordia, created on first use. */
NSURL *DCDRootURL(void);

/**
 * Resolves `relativePath` inside Documents/Discordia, rejecting absolute paths
 * and anything that would escape it. Returns nil and sets `error` on rejection.
 */
NSURL *DCDResolvePath(NSString *relativePath, NSError **error);

/** Writes atomically, creating parent directories. */
BOOL DCDWriteData(NSData *data, NSURL *url, NSError **error);

NSDictionary *DCDReadJSONObject(NSURL *url);
BOOL DCDWriteJSONObject(id object, NSURL *url, NSError **error);

/** Whether this dylib was installed by a jailbreak (vs. injected into the app bundle). */
BOOL DCDIsJailbroken(void);

NSError *DCDError(NSString *message);

#pragma mark - Loader config (DCDLoader.m)

/** Documents/Discordia/loader.json, merged over defaults. */
NSDictionary *DCDLoaderConfig(void);
BOOL DCDSetLoaderConfig(NSDictionary *config, NSError **error);

#pragma mark - Boot guard (DCDBootGuard.m)

typedef NS_ENUM(NSInteger, DCDBootMode) {
    DCDBootModeNormal,
    /** Discordia loads, but no plugins or icon packs. */
    DCDBootModeSafe,
    /** Discordia is not injected at all. */
    DCDBootModeDisabled,
};

@interface DCDBootGuard : NSObject
+ (instancetype)shared;
/** Decides how this JS launch should run and records it as in progress. Call once per JS load. */
- (DCDBootMode)beginLaunch;
/** Clears the failed launch counter. */
- (void)markStable;
@property (nonatomic, readonly) DCDBootMode mode;
@property (nonatomic, readonly, copy) NSString *safeModeReason;
@property (nonatomic, readonly) NSInteger failedBoots;
@end

#pragma mark - Loader (DCDLoader.m)

@interface DCDLoader : NSObject
+ (instancetype)shared;
/** Discordia's script for a new JS context (payload + bundle), or nil when Discordia is disabled. */
- (NSData *)scriptForLaunch;
@property (nonatomic, readonly) NSURL *scriptURL;
@end

#pragma mark - Bridge (DCDBridge.m)

@interface DCDBridge : NSObject
/** Handles `{ method, args }` and calls `completion` with `{ result }` or `{ error }`. */
+ (void)handleCall:(NSDictionary *)call completion:(void (^)(NSDictionary *response))completion;
@end

#pragma mark - Diagnostics (DCDDiagnostics.m)

/** Logs to os_log and the on-device log (Documents/Discordia/logs, three-finger long press). */
void DCDLogNative(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);

@interface DCDDiagnostics : NSObject
+ (instancetype)shared;
/** Installs the log viewer gesture and the startup banner. Call from the constructor. */
- (void)start;
- (void)log:(NSString *)message source:(NSString *)source level:(NSString *)level;
- (void)recordHook:(NSString *)hookName injectedBytes:(NSUInteger)bytes;
- (void)recordJSStatus:(NSDictionary *)status;
- (void)presentViewer;
@end

#pragma mark - Built-in plugins (DCDBuiltins.m)

/** Built-in plugin metadata, without code. */
NSArray<NSDictionary *> *DCDBuiltinIndex(void);
/** Code for one built-in plugin, or nil. */
NSString *DCDBuiltinCode(NSString *pluginId);

#pragma mark - SQLite (DCDDatabase.m)

void DCDDatabaseExecute(NSString *name, NSString *sql, NSArray *params, void (^done)(id result, NSString *error));
void DCDDatabaseBatch(NSString *name, NSArray *statements, void (^done)(id result, NSString *error));
NSNumber *DCDDatabaseSize(NSString *name);

#pragma mark - Images (DCDImageCache.m)

/** Downloads `url`, stores a downscaled JPEG at `relativePath` (options: maxSize, quality, greyscale, alpha). */
void DCDImageCache(NSString *url, NSString *relativePath, NSDictionary *options, void (^done)(id result, NSString *error));

#pragma mark - Recovery UI (DCDRecovery.m)

/** Explains why safe mode / disabled mode kicked in, once the UI is up. */
void DCDShowRecoveryAlertIfNeeded(void);
