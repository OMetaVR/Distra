// Builds the script evaluated before Discord's bundle: a small payload that
// describes this launch (globalThis.__DISCORDIA_LOADER__, see src/core/loader.ts)
// followed by Discordia's JS bundle.

#import "Discordia.h"

extern const unsigned char kDiscordiaBundle[];
extern const size_t kDiscordiaBundleLength;
extern const char *const kDiscordiaBundleVersion;

static const NSTimeInterval kCustomBundleTimeout = 3.0;

#pragma mark - Loader config

static NSURL *DCDLoaderConfigURL(void) {
    return [DCDRootURL() URLByAppendingPathComponent:@"loader.json"];
}

static NSDictionary *DCDDefaultLoaderConfig(void) {
    return @{
        @"customLoadUrl": @{ @"enabled": @NO, @"url": @"http://localhost:4040/discordia.js" },
        @"safeMode": @NO,
        @"showStartupBanner": @YES,
    };
}

NSDictionary *DCDLoaderConfig(void) {
    NSMutableDictionary *config = [DCDDefaultLoaderConfig() mutableCopy];
    [config addEntriesFromDictionary:DCDReadJSONObject(DCDLoaderConfigURL()) ?: @{}];
    if (![config[@"customLoadUrl"] isKindOfClass:NSDictionary.class]) config[@"customLoadUrl"] = DCDDefaultLoaderConfig()[@"customLoadUrl"];
    return config;
}

BOOL DCDSetLoaderConfig(NSDictionary *config, NSError **error) {
    if (![config isKindOfClass:NSDictionary.class]) {
        if (error) *error = DCDError(@"Loader config must be an object");
        return NO;
    }
    return DCDWriteJSONObject(config, DCDLoaderConfigURL(), error);
}

#pragma mark - Loader

@implementation DCDLoader

+ (instancetype)shared {
    static DCDLoader *shared;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ shared = [self new]; });
    return shared;
}

- (NSURL *)scriptURL {
    return [NSURL URLWithString:DCDScriptScheme @"://discordia.js"];
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
        else DCDLogNative(@"Custom bundle fetch from %@ failed (HTTP %ld): %@", urlString, (long)status, error.localizedDescription ?: @"empty response");
        dispatch_semaphore_signal(done);
    }] resume];
    dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)((kCustomBundleTimeout + 1) * NSEC_PER_SEC)));
    return result;
}

- (NSDictionary *)payloadWithConfig:(NSDictionary *)config guard:(DCDBootGuard *)guard bundleSource:(NSString *)source bundleVersion:(NSString *)version {
    NSDictionary *info = NSBundle.mainBundle.infoDictionary;
    BOOL safeMode = guard.mode == DCDBootModeSafe;
    return @{
        @"name": DCDLoaderName,
        @"version": DCDLoaderVersion,
        @"platform": @"ios",
        @"jailbroken": @(DCDIsJailbroken()),
        @"bridge": @{ @"module": @"FileReaderModule", @"method": @"readAsDataURL", @"key": @"discordia" },
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
    DCDBootGuard *guard = DCDBootGuard.shared;
    if ([guard beginLaunch] == DCDBootModeDisabled) {
        DCDLogNative(@"Too many failed launches; starting Discord without Discordia");
        DCDShowRecoveryAlertIfNeeded();
        return nil;
    }

    NSDictionary *config = DCDLoaderConfig();
    NSData *bundle;
    NSString *source = @"embedded";
    NSString *version = @(kDiscordiaBundleVersion);

    NSDictionary *custom = config[@"customLoadUrl"];
    if ([custom[@"enabled"] boolValue] && [custom[@"url"] isKindOfClass:NSString.class]) {
        bundle = [self fetchCustomBundle:custom[@"url"]];
        if (bundle) {
            source = @"custom-url";
            version = custom[@"url"];
        }
    }
    if (!bundle) {
        bundle = [NSData dataWithBytesNoCopy:(void *)kDiscordiaBundle length:kDiscordiaBundleLength freeWhenDone:NO];
    }

    NSData *payloadJSON = [NSJSONSerialization dataWithJSONObject:[self payloadWithConfig:config guard:guard bundleSource:source bundleVersion:version] options:0 error:nil];
    NSMutableData *script = [NSMutableData dataWithCapacity:bundle.length + payloadJSON.length + 64];
    [script appendData:[@"globalThis.__DISCORDIA_LOADER__=" dataUsingEncoding:NSUTF8StringEncoding]];
    [script appendData:payloadJSON];
    [script appendData:[@";\n" dataUsingEncoding:NSUTF8StringEncoding]];
    [script appendData:bundle];

    if (guard.mode == DCDBootModeSafe) DCDShowRecoveryAlertIfNeeded();
    DCDLogNative(@"Injecting Discordia (%@ bundle %@, %lu bytes)", source, version, (unsigned long)script.length);
    return script;
}

@end
