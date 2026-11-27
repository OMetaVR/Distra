// Hooks. Distra's script has to run in the same JS runtime as Discord's,
// immediately before Discord's bundle, every time a JS context is created
// (launch and every reload). React Native loads the bundle through one of two
// paths depending on the architecture, so both are hooked:
//
//   - legacy bridge:   -[RCTCxxBridge executeApplicationScript:url:async:]
//   - bridgeless:      -[RCTInstance _loadScriptFromSource:]
//
// Discord 348 ships with RCTNewArchEnabled, so the bridgeless path is expected;
// the bridge hook covers older builds.

#import "Distra.h"
#import <objc/runtime.h>

typedef void (^RCTPromiseResolveBlock)(id result);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *error);

@interface RCTCxxBridge : NSObject
- (void)executeApplicationScript:(NSData *)script url:(NSURL *)url async:(BOOL)async;
@end

@interface RCTInstance : NSObject
- (void)_loadScriptFromSource:(id)source;
@end

/** Stands in for React Native's RCTSource, which `_loadScriptFromSource:` reads `url` and `data` from. */
@interface DSTScriptSource : NSObject
@property (nonatomic, strong) NSURL *url;
@property (nonatomic, strong) NSData *data;
@property (nonatomic, readonly) NSUInteger length;
@property (nonatomic, readonly) NSInteger filesChangedCount;
@end

@implementation DSTScriptSource
- (NSUInteger)length { return self.data.length; }
- (NSInteger)filesChangedCount { return 0; }
@end

static const void *kInjectedKey = &kInjectedKey;

/**
 * Whether Distra should be injected before `url` on `owner`: once per JS
 * context (bridge or instance object), and never before our own script.
 */
static BOOL DSTShouldInject(id owner, NSURL *url) {
    if ([url.scheme isEqualToString:DSTScriptScheme]) return NO;
    @synchronized (owner) {
        if (objc_getAssociatedObject(owner, kInjectedKey)) return NO;
        objc_setAssociatedObject(owner, kInjectedKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    DSTLogNative(@"Discord bundle %@ is loading via %@", url.absoluteString ?: @"(no url)", NSStringFromClass([owner class]));
    return YES;
}

%hook RCTCxxBridge

- (void)executeApplicationScript:(NSData *)script url:(NSURL *)url async:(BOOL)async {
    if (DSTShouldInject(self, url)) {
        NSData *distra = [DSTLoader.shared scriptForLaunch];
        [DSTDiagnostics.shared recordHook:@"RCTCxxBridge" injectedBytes:distra.length];
        if (distra) %orig(distra, DSTLoader.shared.scriptURL, NO);
    }
    %orig;
}

%end

%hook RCTInstance

- (void)_loadScriptFromSource:(id)source {
    NSURL *url = [source respondsToSelector:@selector(url)] ? [source url] : nil;
    if (DSTShouldInject(self, url)) {
        NSData *distra = [DSTLoader.shared scriptForLaunch];
        [DSTDiagnostics.shared recordHook:@"RCTInstance" injectedBytes:distra.length];
        if (distra) {
            DSTScriptSource *ours = [DSTScriptSource new];
            ours.url = DSTLoader.shared.scriptURL;
            ours.data = distra;
            // Scheduled on the JS thread ahead of Discord's bundle, which is queued next.
            %orig(ours);
        }
    }
    %orig;
}

%end

// JS -> native bridge (src/core/bridge.ts). Calls carrying our key are handled
// natively; everything else is a genuine FileReader call.
%hook RCTFileReaderModule

- (void)readAsDataURL:(NSDictionary *)blob resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    NSDictionary *call = [blob isKindOfClass:NSDictionary.class] ? blob[@"distra"] : nil;
    if (![call isKindOfClass:NSDictionary.class]) {
        %orig;
        return;
    }
    static dispatch_once_t firstCall;
    dispatch_once(&firstCall, ^{ DSTLogNative(@"First JS bridge call received: %@", call[@"method"]); });
    [DSTBridge handleCall:call completion:^(NSDictionary *response) {
        resolve(response);
    }];
}

%end

// App groups. Discord asks for "group.com.hammerandchisel.discord", the group in its own signature.
// Sideloading re-signs the app, and signers usually give the group a new name (a team ID added, or the
// new bundle ID) or drop it. Screen sharing needs the real thing: the app and its BroadcastUpload
// extension meet at a socket (bcast_tx.sock) in the shared container, so a missing or private folder
// gives "Could not connect to Discord App". So: Discord's group if it's entitled, else the group the
// signer did grant (the one named most like Discord's), and only if there's none, a private folder in
// the app's Documents so the rest of Discord keeps working. The release IPA also loads this into the
// broadcast extension (scripts/build-ipa.py), so both sides pick the same group.

typedef struct __SecTask *DSTSecTaskRef;
extern DSTSecTaskRef SecTaskCreateFromSelf(CFAllocatorRef allocator);
extern CFTypeRef SecTaskCopyValueForEntitlement(DSTSecTaskRef task, CFStringRef entitlement, CFErrorRef *error);

/** The app groups this process is signed with, the ones most like `wanted` first. */
static NSArray<NSString *> *DSTEntitledAppGroups(NSString *wanted) {
    static NSArray<NSString *> *groups;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSMutableArray *found = [NSMutableArray array];
        DSTSecTaskRef task = SecTaskCreateFromSelf(kCFAllocatorDefault);
        if (task) {
            CFTypeRef value = SecTaskCopyValueForEntitlement(task, CFSTR("com.apple.security.application-groups"), NULL);
            if (value) {
                id list = (__bridge_transfer id)value;
                if ([list isKindOfClass:NSArray.class]) {
                    for (id group in list) if ([group isKindOfClass:NSString.class]) [found addObject:group];
                }
            }
            CFRelease(task);
        }
        groups = found;
    });
    NSString *lowered = wanted.lowercaseString;
    return [groups sortedArrayUsingComparator:^NSComparisonResult(NSString *a, NSString *b) {
        BOOL aLike = [a.lowercaseString containsString:lowered] || [lowered containsString:a.lowercaseString];
        BOOL bLike = [b.lowercaseString containsString:lowered] || [lowered containsString:b.lowercaseString];
        if (aLike != bLike) return aLike ? NSOrderedAscending : NSOrderedDescending;
        return [a compare:b];
    }];
}

static BOOL DSTIsAppExtension(void) {
    return [NSBundle.mainBundle.bundlePath.pathExtension isEqualToString:@"appex"];
}

static NSString *const DSTExtensionLogName = @"distra-extension.log";

// Extensions report what happened with Darwin notifications too, which reach the app even when the two
// share no folder (the app logs them; see DSTWatchExtensionSignals).
static NSString *const DSTSignalPrefix = @"dev.distra.extension.";
static NSArray<NSString *> *DSTSignals(void) {
    return @[@"loaded", @"groups.none", @"groups.some", @"resolved.original", @"resolved.remapped", @"resolved.none"];
}

static void DSTSignal(NSString *name) {
    if (!DSTIsAppExtension()) return;
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), (__bridge CFStringRef)[DSTSignalPrefix stringByAppendingString:name], NULL, NULL, true);
}

static void DSTSignalReceived(CFNotificationCenterRef center, void *observer, CFNotificationName name, const void *object, CFDictionaryRef userInfo) {
    DSTLogNative(@"Extension signal: %@", (__bridge NSString *)name);
}

static void DSTWatchExtensionSignals(void) {
    for (NSString *signal in DSTSignals()) {
        CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), NULL, DSTSignalReceived,
            (__bridge CFStringRef)[DSTSignalPrefix stringByAppendingString:signal], NULL, CFNotificationSuspensionBehaviorDeliverImmediately);
    }
}

/** Extensions can't reach Distra's logs, so they note what happened in the shared container (read by appGroups.info). */
static void DSTExtensionLog(NSURL *container, NSString *line) {
    if (!container || !DSTIsAppExtension()) return;
    NSString *path = [container.path stringByAppendingPathComponent:DSTExtensionLogName];
    NSString *entry = [NSString stringWithFormat:@"%@ [%@ %d] %@\n", NSDate.date, NSBundle.mainBundle.bundleIdentifier, getpid(), line];
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
    if (!handle) {
        [entry writeToFile:path atomically:NO encoding:NSUTF8StringEncoding error:nil];
        return;
    }
    [handle seekToEndOfFile];
    [handle writeData:[entry dataUsingEncoding:NSUTF8StringEncoding]];
    [handle closeFile];
}

/** Names in a folder with their type and size, for diagnostics. */
static NSArray<NSString *> *DSTDirectoryListing(NSString *path) {
    if (!path) return nil;
    NSMutableArray *out = [NSMutableArray array];
    for (NSString *name in [NSFileManager.defaultManager contentsOfDirectoryAtPath:path error:nil]) {
        NSDictionary *attributes = [NSFileManager.defaultManager attributesOfItemAtPath:[path stringByAppendingPathComponent:name] error:nil];
        [out addObject:[NSString stringWithFormat:@"%@ (%@, %@ bytes)", name, attributes.fileType ?: @"?", attributes[NSFileSize] ?: @"?"]];
    }
    return out;
}

/** For diagnostics (bridge `appGroups.info`): the granted groups and where Discord's group resolves. */
NSDictionary *DSTAppGroupInfo(void) {
    NSString *discord = @"group.com.hammerandchisel.discord";
    NSURL *resolved = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:discord];
    NSString *documents = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject.path;
    return @{
        @"entitled": DSTEntitledAppGroups(discord) ?: @[],
        @"resolved": resolved.path ?: NSNull.null,
        @"shared": @(resolved && documents && ![resolved.path hasPrefix:documents]),
        @"broadcastExtension": @([NSFileManager.defaultManager fileExistsAtPath:[NSBundle.mainBundle.builtInPlugInsPath stringByAppendingPathComponent:@"BroadcastUpload.appex"]]),
        @"contents": DSTDirectoryListing(resolved.path) ?: @[],
        @"extensionLog": (resolved ? [NSString stringWithContentsOfFile:[resolved.path stringByAppendingPathComponent:DSTExtensionLogName] encoding:NSUTF8StringEncoding error:nil] : nil) ?: NSNull.null,
    };
}

%group AppGroups

%hook NSFileManager

- (NSURL *)containerURLForSecurityApplicationGroupIdentifier:(NSString *)groupIdentifier {
    NSURL *container = %orig;
    if (container || !groupIdentifier) {
        if (container) DSTSignal(@"resolved.original");
        DSTExtensionLog(container, [NSString stringWithFormat:@"%@ -> granted as is", groupIdentifier]);
        return container;
    }

    for (NSString *group in DSTEntitledAppGroups(groupIdentifier)) {
        if ([group isEqualToString:groupIdentifier]) continue;
        container = %orig(group);
        if (container) {
            static dispatch_once_t logged;
            dispatch_once(&logged, ^{ DSTLogNative(@"App group %@ not granted; using %@", groupIdentifier, group); });
            DSTSignal(@"resolved.remapped");
            DSTExtensionLog(container, [NSString stringWithFormat:@"%@ -> %@ (%@)", groupIdentifier, group, container.path]);
            return container;
        }
    }

    // No shared group at all: extensions can't share anything with the app either way.
    if (DSTIsAppExtension()) {
        DSTSignal(@"resolved.none");
        NSLog(@"[Distra] %@: app group %@ not granted and none to use (entitled: %@)", NSBundle.mainBundle.bundleIdentifier, groupIdentifier, DSTEntitledAppGroups(groupIdentifier));
        return nil;
    }
    static dispatch_once_t warned;
    dispatch_once(&warned, ^{ DSTLogNative(@"No app group granted by the signer; screen sharing and extensions can't reach Discord"); });
    NSURL *documents = [self URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
    NSURL *fallback = [documents URLByAppendingPathComponent:@"AppGroup" isDirectory:YES];
    [self createDirectoryAtURL:fallback withIntermediateDirectories:YES attributes:nil error:nil];
    return fallback;
}

%end

%end

%ctor {
    @autoreleasepool {
        // In Discord's app extensions (the release IPA loads Distra into the screen-share one), only
        // the app group fix runs.
        %init(AppGroups);
        if (DSTIsAppExtension()) {
            DSTSignal(@"loaded");
            DSTSignal(DSTEntitledAppGroups(@"group.com.hammerandchisel.discord").count ? @"groups.some" : @"groups.none");
            NSLog(@"[Distra] loaded into extension %@ (entitled app groups: %@)", NSBundle.mainBundle.bundleIdentifier, DSTEntitledAppGroups(@"group.com.hammerandchisel.discord"));
            NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:@"group.com.hammerandchisel.discord"];
            DSTExtensionLog(container, [NSString stringWithFormat:@"loaded; entitled %@", DSTEntitledAppGroups(@"group.com.hammerandchisel.discord")]);
            return;
        }
        [DSTDiagnostics.shared start];
        DSTWatchExtensionSignals();
        DSTLogNative(@"Distra tweak %s loaded (%@) into %@", DISTRA_TWEAK_VERSION, DSTIsJailbroken() ? @"jailbreak" : @"injected", NSBundle.mainBundle.bundleIdentifier);
        for (NSString *name in @[@"RCTInstance", @"RCTCxxBridge", @"RCTFileReaderModule"]) {
            DSTLogNative(@"Class %@: %@", name, NSClassFromString(name) ? @"found" : @"MISSING");
        }
        %init;
        DSTThemeLoadSaved();
        DSTFontsLoadSaved();
        DSTCodeBlocksInstall();
    }
}
