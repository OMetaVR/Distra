// Builds the script evaluated before Discord's bundle: a small payload that
// describes this launch (globalThis.__DISTRA_LOADER__, see src/core/loader.ts)
// followed by Distra's JS bundle.

#import "Distra.h"

extern const unsigned char kDistraBundle[];
extern const size_t kDistraBundleLength;
extern const char *const kDistraBundleVersion;

static const NSTimeInterval kCustomBundleTimeout = 3.0;

#pragma mark - Loader config

static NSURL *DSTLoaderConfigURL(void) {
    return [DSTRootURL() URLByAppendingPathComponent:@"loader.json"];
}

static NSDictionary *DSTDefaultLoaderConfig(void) {
    return @{
        @"customLoadUrl": @{ @"enabled": @NO, @"url": @"http://localhost:4040/distra.js" },
        @"safeMode": @NO,
        @"showStartupBanner": @YES,
    };
}

NSDictionary *DSTLoaderConfig(void) {
    NSMutableDictionary *config = [DSTDefaultLoaderConfig() mutableCopy];
    [config addEntriesFromDictionary:DSTReadJSONObject(DSTLoaderConfigURL()) ?: @{}];
    if (![config[@"customLoadUrl"] isKindOfClass:NSDictionary.class]) config[@"customLoadUrl"] = DSTDefaultLoaderConfig()[@"customLoadUrl"];
    return config;
}

BOOL DSTSetLoaderConfig(NSDictionary *config, NSError **error) {
    if (![config isKindOfClass:NSDictionary.class]) {
        if (error) *error = DSTError(@"Loader config must be an object");
        return NO;
    }
    return DSTWriteJSONObject(config, DSTLoaderConfigURL(), error);
}

#pragma mark - Loader

@implementation DSTLoader

+ (instancetype)shared {
    static DSTLoader *shared;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ shared = [self new]; });
    return shared;
}

- (NSURL *)scriptURL {
    return [NSURL URLWithString:DSTScriptScheme @"://distra.js"];
}

/** Synchronously downloads the development bundle, or returns nil. */
- (NSData *)fetchCustomBundle:(NSString *)urlString {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url.scheme || !url.host) return nil;

    NSURLRequest *request = [NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:kCustomBundleTimeout];
    __block NSData *result;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        if (!error && status == 200 && data.length > 0) result = data;
        else DSTLogNative(@"Custom bundle fetch from %@ failed (HTTP %ld): %@", urlString, (long)status, error.localizedDescription ?: @"empty response");
        dispatch_semaphore_signal(done);
    }] resume];
    dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)((kCustomBundleTimeout + 1) * NSEC_PER_SEC)));
    return result;
}

- (NSDictionary *)payloadWithConfig:(NSDictionary *)config guard:(DSTBootGuard *)guard bundleSource:(NSString *)source bundleVersion:(NSString *)version {
    NSDictionary *info = NSBundle.mainBundle.infoDictionary;
    BOOL safeMode = guard.mode == DSTBootModeSafe;
    return @{
        @"name": DSTLoaderName,
        @"version": DSTLoaderVersion,
        @"platform": @"ios",
        @"jailbroken": @(DSTIsJailbroken()),
        @"bridge": @{ @"module": @"FileReaderModule", @"method": @"readAsDataURL", @"key": @"distra" },
        @"discord": @{
            @"version": info[@"CFBundleShortVersionString"] ?: @"unknown",
            @"build": info[@"CFBundleVersion"] ?: @"unknown",
            @"bundleId": NSBundle.mainBundle.bundleIdentifier ?: @"unknown",
        },
        @"safeMode": @{
            @"enabled": @(safeMode),
            @"reason": safeMode && guard.safeModeReason ? guard.safeModeReason : NSNull.null,
            @"failedBoots": @(guard.failedBoots),
        },
        @"config": config,
        @"bundle": @{ @"source": source, @"version": version },
    };
}

- (NSData *)scriptForLaunch {
    DSTBootGuard *guard = DSTBootGuard.shared;
    if ([guard beginLaunch] == DSTBootModeDisabled) {
        DSTLogNative(@"Too many failed launches; starting Discord without Distra");
        DSTShowRecoveryAlertIfNeeded();
        return nil;
    }

    NSDictionary *config = DSTLoaderConfig();
    NSData *bundle;
    NSString *source = @"embedded";
    NSString *version = @(kDistraBundleVersion);

    NSDictionary *custom = config[@"customLoadUrl"];
    if ([custom[@"enabled"] boolValue] && [custom[@"url"] isKindOfClass:NSString.class]) {
        bundle = [self fetchCustomBundle:custom[@"url"]];
        if (bundle) {
            source = @"custom-url";
            version = custom[@"url"];
        }
    }
    if (!bundle) {
        bundle = [NSData dataWithBytesNoCopy:(void *)kDistraBundle length:kDistraBundleLength freeWhenDone:NO];
    }

    NSData *payloadJSON = [NSJSONSerialization dataWithJSONObject:[self payloadWithConfig:config guard:guard bundleSource:source bundleVersion:version] options:0 error:nil];
    NSMutableData *script = [NSMutableData dataWithCapacity:bundle.length + payloadJSON.length + 64];
    [script appendData:[@"globalThis.__DISTRA_LOADER__=" dataUsingEncoding:NSUTF8StringEncoding]];
    [script appendData:payloadJSON];
    [script appendData:[@";\n" dataUsingEncoding:NSUTF8StringEncoding]];
    [script appendData:bundle];

    if (guard.mode == DSTBootModeSafe) DSTShowRecoveryAlertIfNeeded();
    DSTLogNative(@"Injecting Distra (%@ bundle %@, %lu bytes)", source, version, (unsigned long)script.length);
    return script;
}

@end
