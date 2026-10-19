#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <os/log.h>

#ifndef DISTRA_TWEAK_VERSION
#define DISTRA_TWEAK_VERSION "0.0.0"
#endif

#ifndef DISTRA_INSTALL_PREFIX
#define DISTRA_INSTALL_PREFIX ""
#endif

#define DSTLoaderName @"DistraTweak"
#define DSTLoaderVersion @DISTRA_TWEAK_VERSION

/** URL scheme of scripts the tweak evaluates; anything else is Discord's. */
#define DSTScriptScheme @"distra"

os_log_t DSTLog(void);

#pragma mark - Paths (DSTPaths.m)

/** Documents/Distra, created on first use. */
NSURL *DSTRootURL(void);

/**
 * Resolves `relativePath` inside Documents/Distra, rejecting absolute paths
 * and anything that would escape it. Returns nil and sets `error` on rejection.
 */
NSURL *DSTResolvePath(NSString *relativePath, NSError **error);

/** Writes atomically, creating parent directories. */
BOOL DSTWriteData(NSData *data, NSURL *url, NSError **error);

NSDictionary *DSTReadJSONObject(NSURL *url);
BOOL DSTWriteJSONObject(id object, NSURL *url, NSError **error);

/** Whether this dylib was installed by a jailbreak (vs. injected into the app bundle). */
BOOL DSTIsJailbroken(void);

NSError *DSTError(NSString *message);

#pragma mark - Loader config (DSTLoader.m)

/** Documents/Distra/loader.json, merged over defaults. */
NSDictionary *DSTLoaderConfig(void);
BOOL DSTSetLoaderConfig(NSDictionary *config, NSError **error);

#pragma mark - Boot guard (DSTBootGuard.m)

typedef NS_ENUM(NSInteger, DSTBootMode) {
    DSTBootModeNormal,
    /** Distra loads, but no plugins or icon packs. */
    DSTBootModeSafe,
    /** Distra is not injected at all. */
    DSTBootModeDisabled,
};

@interface DSTBootGuard : NSObject
+ (instancetype)shared;
/** Decides how this JS launch should run and records it as in progress. Call once per JS load. */
- (DSTBootMode)beginLaunch;
/** Clears the failed launch counter. */
- (void)markStable;
@property (nonatomic, readonly) DSTBootMode mode;
@property (nonatomic, readonly, copy) NSString *safeModeReason;
@property (nonatomic, readonly) NSInteger failedBoots;
@end

#pragma mark - Loader (DSTLoader.m)

@interface DSTLoader : NSObject
+ (instancetype)shared;
/** Distra's script for a new JS context (payload + bundle), or nil when Distra is disabled. */
- (NSData *)scriptForLaunch;
@property (nonatomic, readonly) NSURL *scriptURL;
@end

#pragma mark - Bridge (DSTBridge.m)

@interface DSTBridge : NSObject
/** Handles `{ method, args }` and calls `completion` with `{ result }` or `{ error }`. */
+ (void)handleCall:(NSDictionary *)call completion:(void (^)(NSDictionary *response))completion;
@end

#pragma mark - Diagnostics (DSTDiagnostics.m)

/** Logs to os_log and the on-device log (Documents/Distra/logs, three-finger long press). */
void DSTLogNative(NSString *format, ...) NS_FORMAT_FUNCTION(1, 2);

@interface DSTDiagnostics : NSObject
+ (instancetype)shared;
/** Installs the log viewer gesture and the startup banner. Call from the constructor. */
- (void)start;
- (void)log:(NSString *)message source:(NSString *)source level:(NSString *)level;
- (void)recordHook:(NSString *)hookName injectedBytes:(NSUInteger)bytes;
- (void)recordJSStatus:(NSDictionary *)status;
- (void)presentViewer;
@end

#pragma mark - Built-in plugins (DSTBuiltins.m)

/** Built-in plugin metadata, without code. */
NSArray<NSDictionary *> *DSTBuiltinIndex(void);
/** Code for one built-in plugin, or nil. */
NSString *DSTBuiltinCode(NSString *pluginId);

#pragma mark - SQLite (DSTDatabase.m)

void DSTDatabaseExecute(NSString *name, NSString *sql, NSArray *params, void (^done)(id result, NSString *error));
void DSTDatabaseBatch(NSString *name, NSArray *statements, void (^done)(id result, NSString *error));
NSNumber *DSTDatabaseSize(NSString *name);

#pragma mark - Images (DSTImageCache.m)

/** Downloads `url`, stores a downscaled JPEG at `relativePath` (options: maxSize, quality, greyscale, alpha). */
void DSTImageCache(NSString *url, NSString *relativePath, NSDictionary *options, void (^done)(id result, NSString *error));

#pragma mark - Recovery UI (DSTRecovery.m)

/** Explains why safe mode / disabled mode kicked in, once the UI is up. */
void DSTShowRecoveryAlertIfNeeded(void);

#pragma mark - Themes (DSTTheme.m)

/** Applies the native colours saved by the last selected theme. Call at launch. */
void DSTThemeLoadSaved(void);
/** Installs and saves `{ name, colors: { camelCaseToken: "#rrggbbaa" } }`; no colours restores Discord's. */
BOOL DSTThemeSetNative(NSDictionary *payload, NSError **error);
/** DCDThemeColor's colour getters and how many are themed, for diagnostics. */
NSDictionary *DSTThemeNativeInfo(void);

#pragma mark - Fonts (DSTFonts.m)

/** Registers the saved custom fonts and installs their replacements. Call at launch. */
void DSTFontsLoadSaved(void);
/** Installs and saves `{ scope, files, map }`; an empty map restores Discord's fonts. Returns `{ active, problems }`. */
NSDictionary *DSTFontsApply(NSDictionary *table, NSError **error);
/** The fonts in a font file (PostScript name, family, weight, italic, monospace), without registering it. */
NSArray<NSDictionary *> *DSTFontsInspect(NSString *relativePath, NSError **error);
/** Hooks, active replacements and how often they were used, for diagnostics. */
NSDictionary *DSTFontsInfo(void);

#pragma mark - Code blocks (DSTCodeBlocks.m)

/** Hooks Discord's code block text so rows can carry syntax colours. Call at launch. */
void DSTCodeBlocksInstall(void);
/** Which hooks are installed and how often they coloured a block, for the plugin and diagnostics. */
NSDictionary *DSTCodeBlocksInfo(void);

#pragma mark - Reactions (DSTReactions.m)

/** Installs the reactor avatar hooks (once) and returns what was found plus counters, for WhoReacted. */
NSDictionary *DSTReactionsEnable(void);
NSDictionary *DSTReactionsInspect(void);

#pragma mark - Header badges (DSTHeaderBadges.m)

/** Installs the chat header badge hooks (once) and reports `{ hooked, version, missing, cachedMessages, counters }`. */
NSDictionary *DSTHeaderBadgesEnable(void);
/** Forgets every message's badges (the plugin stopped). */
void DSTHeaderBadgesClear(void);
