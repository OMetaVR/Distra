// Hooks. Discordia's script has to run in the same JS runtime as Discord's,
// immediately before Discord's bundle, every time a JS context is created
// (launch and every reload). React Native loads the bundle through one of two
// paths depending on the architecture, so both are hooked:
//
//   - legacy bridge:   -[RCTCxxBridge executeApplicationScript:url:async:]
//   - bridgeless:      -[RCTInstance _loadScriptFromSource:]
//
// Discord 348 ships with RCTNewArchEnabled, so the bridgeless path is expected;
// the bridge hook covers older builds.

#import "Discordia.h"
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
@interface DCDScriptSource : NSObject
@property (nonatomic, strong) NSURL *url;
@property (nonatomic, strong) NSData *data;
@property (nonatomic, readonly) NSUInteger length;
@property (nonatomic, readonly) NSInteger filesChangedCount;
@end

@implementation DCDScriptSource
- (NSUInteger)length { return self.data.length; }
- (NSInteger)filesChangedCount { return 0; }
@end

static const void *kInjectedKey = &kInjectedKey;

/**
 * Whether Discordia should be injected before `url` on `owner`: once per JS
 * context (bridge or instance object), and never before our own script.
 */
static BOOL DCDShouldInject(id owner, NSURL *url) {
    if ([url.scheme isEqualToString:DCDScriptScheme]) return NO;
    @synchronized (owner) {
        if (objc_getAssociatedObject(owner, kInjectedKey)) return NO;
        objc_setAssociatedObject(owner, kInjectedKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    DCDLogNative(@"Discord bundle %@ is loading via %@", url.absoluteString ?: @"(no url)", NSStringFromClass([owner class]));
    return YES;
}

%hook RCTCxxBridge

- (void)executeApplicationScript:(NSData *)script url:(NSURL *)url async:(BOOL)async {
    if (DCDShouldInject(self, url)) {
        NSData *discordia = [DCDLoader.shared scriptForLaunch];
        [DCDDiagnostics.shared recordHook:@"RCTCxxBridge" injectedBytes:discordia.length];
        if (discordia) %orig(discordia, DCDLoader.shared.scriptURL, NO);
    }
    %orig;
}

%end

%hook RCTInstance

- (void)_loadScriptFromSource:(id)source {
    NSURL *url = [source respondsToSelector:@selector(url)] ? [source url] : nil;
    if (DCDShouldInject(self, url)) {
        NSData *discordia = [DCDLoader.shared scriptForLaunch];
        [DCDDiagnostics.shared recordHook:@"RCTInstance" injectedBytes:discordia.length];
        if (discordia) {
            DCDScriptSource *ours = [DCDScriptSource new];
            ours.url = DCDLoader.shared.scriptURL;
            ours.data = discordia;
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
    NSDictionary *call = [blob isKindOfClass:NSDictionary.class] ? blob[@"discordia"] : nil;
    if (![call isKindOfClass:NSDictionary.class]) {
        %orig;
        return;
    }
    static dispatch_once_t firstCall;
    dispatch_once(&firstCall, ^{ DCDLogNative(@"First JS bridge call received: %@", call[@"method"]); });
    [DCDBridge handleCall:call completion:^(NSDictionary *response) {
        resolve(response);
    }];
}

%end

// Sideloaded IPAs lose Discord's app group entitlement, which Discord relies on
// for shared storage. Give it a private folder instead of nil.
%hook NSFileManager

- (NSURL *)containerURLForSecurityApplicationGroupIdentifier:(NSString *)groupIdentifier {
    NSURL *container = %orig;
    if (container || !groupIdentifier) return container;

    NSURL *documents = [self URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
    NSURL *fallback = [documents URLByAppendingPathComponent:@"AppGroup" isDirectory:YES];
    [self createDirectoryAtURL:fallback withIntermediateDirectories:YES attributes:nil error:nil];
    return fallback;
}

%end

%ctor {
    @autoreleasepool {
        [DCDDiagnostics.shared start];
        DCDLogNative(@"Discordia tweak %s loaded (%@) into %@", DISCORDIA_TWEAK_VERSION, DCDIsJailbroken() ? @"jailbreak" : @"injected", NSBundle.mainBundle.bundleIdentifier);
        for (NSString *name in @[@"RCTInstance", @"RCTCxxBridge", @"RCTFileReaderModule"]) {
            DCDLogNative(@"Class %@: %@", name, NSClassFromString(name) ? @"found" : @"MISSING");
        }
        %init;
    }
}
