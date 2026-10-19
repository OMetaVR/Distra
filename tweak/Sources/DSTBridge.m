// Native functions callable from JS through the hooked
// RCTFileReaderModule.readAsDataURL (see Tweak.x and src/core/bridge.ts).
// Every handler receives the JS arguments and calls `done(result, error)`.

#import "Distra.h"

typedef void (^DSTDone)(id result, NSString *error);
typedef void (^DSTHandler)(NSArray *args, DSTDone done);

static id DSTArg(NSArray *args, NSUInteger index) {
    id value = index < args.count ? args[index] : nil;
    return value == NSNull.null ? nil : value;
}

#pragma mark - Icon packs

/** Directories that may contain icon packs, in priority order. */
static NSArray<NSDictionary *> *DSTIconPackRoots(void) {
    NSMutableArray *roots = [NSMutableArray arrayWithObject:@{
        @"source": @"documents",
        @"url": [DSTRootURL() URLByAppendingPathComponent:@"IconPacks" isDirectory:YES],
    }];
    [roots addObject:@{
        @"source": @"bundled",
        @"url": [NSBundle.mainBundle.bundleURL URLByAppendingPathComponent:@"DistraIconPacks" isDirectory:YES],
    }];
    if (DSTIsJailbroken()) {
        NSString *path = [@DISTRA_INSTALL_PREFIX stringByAppendingPathComponent:@"/Library/Application Support/Distra/IconPacks"];
        [roots addObject:@{ @"source": @"bundled", @"url": [NSURL fileURLWithPath:path isDirectory:YES] }];
    }
    return roots;
}

static NSArray<NSDictionary *> *DSTListIconPacks(void) {
    NSMutableArray *packs = [NSMutableArray array];
    NSMutableSet *seen = [NSMutableSet set];
    for (NSDictionary *root in DSTIconPackRoots()) {
        NSArray<NSURL *> *entries = [NSFileManager.defaultManager contentsOfDirectoryAtURL:root[@"url"] includingPropertiesForKeys:@[NSURLIsDirectoryKey] options:NSDirectoryEnumerationSkipsHiddenFiles error:nil];
        for (NSURL *entry in [entries sortedArrayUsingComparator:^(NSURL *a, NSURL *b) { return [a.lastPathComponent compare:b.lastPathComponent]; }]) {
            NSNumber *isDirectory;
            [entry getResourceValue:&isDirectory forKey:NSURLIsDirectoryKey error:nil];
            NSString *name = entry.lastPathComponent;
            if (!isDirectory.boolValue || [seen containsObject:name]) continue;
            [seen addObject:name];
            [packs addObject:@{ @"id": name, @"name": name, @"source": root[@"source"], @"path": entry.path }];
        }
    }
    return packs;
}

static NSDictionary *DSTIconPackIndex(NSString *packId, NSString **error) {
    NSDictionary *pack;
    for (NSDictionary *candidate in DSTListIconPacks()) {
        if ([candidate[@"id"] isEqualToString:packId]) pack = candidate;
    }
    if (!pack) {
        *error = [NSString stringWithFormat:@"Icon pack %@ not found", packId];
        return nil;
    }

    NSString *root = pack[@"path"];
    NSMutableArray *files = [NSMutableArray array];
    NSDirectoryEnumerator *enumerator = [NSFileManager.defaultManager enumeratorAtPath:root];
    for (NSString *relative in enumerator) {
        if ([enumerator.fileAttributes[NSFileType] isEqualToString:NSFileTypeRegular]) [files addObject:relative];
    }
    return @{ @"path": root, @"files": files };
}

#pragma mark - App icons

static NSDictionary *DSTAppIconInfo(void) {
    NSDictionary *icons = NSBundle.mainBundle.infoDictionary[@"CFBundleIcons"][@"CFBundleAlternateIcons"];
    NSMutableArray *list = [NSMutableArray array];
    for (NSString *name in [icons.allKeys sortedArrayUsingSelector:@selector(compare:)]) {
        [list addObject:@{ @"name": name, @"files": icons[name][@"CFBundleIconFiles"] ?: @[] }];
    }
    UIApplication *app = UIApplication.sharedApplication;
    return @{
        @"current": app.alternateIconName ?: NSNull.null,
        @"supported": @(app.supportsAlternateIcons),
        @"icons": list,
    };
}

#pragma mark - Handlers

static NSDictionary<NSString *, DSTHandler> *DSTHandlers(void) {
    static NSDictionary *handlers;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        handlers = @{
            // Files, sandboxed to Documents/Distra
            @"fs.read": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                NSString *contents = url ? [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error] : nil;
                done(contents, contents ? nil : error.localizedDescription);
            },
            @"fs.write": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                NSString *contents = DSTArg(args, 1);
                if (url && ![contents isKindOfClass:NSString.class]) error = DSTError(@"Contents must be a string");
                BOOL ok = url && !error && DSTWriteData([contents dataUsingEncoding:NSUTF8StringEncoding], url, &error);
                done(NSNull.null, ok ? nil : error.localizedDescription);
            },
            @"fs.exists": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                done(@(url && [NSFileManager.defaultManager fileExistsAtPath:url.path]), url ? nil : error.localizedDescription);
            },
            @"fs.remove": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                if (url && [NSFileManager.defaultManager fileExistsAtPath:url.path]) [NSFileManager.defaultManager removeItemAtURL:url error:&error];
                done(NSNull.null, url && !error ? nil : error.localizedDescription);
            },
            // Downloads `url` straight to a file (icon packs: thousands of small images, no text round trip).
            @"fs.download": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSString *source = DSTArg(args, 0);
                NSURL *remote = [source isKindOfClass:NSString.class] ? [NSURL URLWithString:source] : nil;
                NSURL *url = DSTResolvePath(DSTArg(args, 1), &error);
                if (!url) return done(nil, error.localizedDescription);
                if (!remote || !([remote.scheme isEqualToString:@"https"] || [remote.scheme isEqualToString:@"http"])) return done(nil, @"Expected an http(s) URL");
                [[NSURLSession.sharedSession downloadTaskWithURL:remote completionHandler:^(NSURL *location, NSURLResponse *response, NSError *downloadError) {
                    NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
                    if (downloadError || !location) return done(nil, downloadError.localizedDescription ?: @"Download failed");
                    if (status >= 400) return done(nil, [NSString stringWithFormat:@"HTTP %ld", (long)status]);
                    NSError *moveError;
                    NSFileManager *files = NSFileManager.defaultManager;
                    [files createDirectoryAtURL:url.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:nil];
                    [files removeItemAtURL:url error:nil];
                    BOOL ok = [files moveItemAtURL:location toURL:url error:&moveError];
                    done(NSNull.null, ok ? nil : moveError.localizedDescription);
                }] resume];
            },
            @"fs.list": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                NSArray *names = url ? [NSFileManager.defaultManager contentsOfDirectoryAtPath:url.path error:&error] : nil;
                done(names, names ? nil : error.localizedDescription);
            },

            // Loader
            @"loader.getConfig": ^(NSArray *args, DSTDone done) {
                done(DSTLoaderConfig(), nil);
            },
            @"loader.setConfig": ^(NSArray *args, DSTDone done) {
                NSError *error;
                BOOL ok = DSTSetLoaderConfig(DSTArg(args, 0), &error);
                done(NSNull.null, ok ? nil : error.localizedDescription);
            },
            @"boot.markStable": ^(NSArray *args, DSTDone done) {
                [DSTBootGuard.shared markStable];
                done(NSNull.null, nil);
            },

            // Diagnostics
            @"log.write": ^(NSArray *args, DSTDone done) {
                NSArray *entries = DSTArg(args, 0);
                if ([entries isKindOfClass:NSArray.class]) {
                    for (NSDictionary *entry in entries) {
                        if (![entry isKindOfClass:NSDictionary.class]) continue;
                        NSString *message = [NSString stringWithFormat:@"[%@] %@", entry[@"tag"] ?: @"?", entry[@"message"] ?: @""];
                        [DSTDiagnostics.shared log:message source:@"js" level:[entry[@"level"] description]];
                    }
                }
                done(NSNull.null, nil);
            },
            @"diag.ready": ^(NSArray *args, DSTDone done) {
                NSDictionary *status = DSTArg(args, 0);
                if ([status isKindOfClass:NSDictionary.class]) [DSTDiagnostics.shared recordJSStatus:status];
                done(NSNull.null, nil);
            },
            @"diag.showLogs": ^(NSArray *args, DSTDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ [DSTDiagnostics.shared presentViewer]; });
                done(NSNull.null, nil);
            },

            // SQLite
            @"db.exec": ^(NSArray *args, DSTDone done) {
                DSTDatabaseExecute(DSTArg(args, 0), DSTArg(args, 1), DSTArg(args, 2), ^(id result, NSString *error) { done(result, error); });
            },
            @"db.batch": ^(NSArray *args, DSTDone done) {
                DSTDatabaseBatch(DSTArg(args, 0), DSTArg(args, 1), ^(id result, NSString *error) { done(result, error); });
            },
            @"db.size": ^(NSArray *args, DSTDone done) {
                NSString *name = DSTArg(args, 0);
                done([name isKindOfClass:NSString.class] ? DSTDatabaseSize(name) : @0, nil);
            },

            // Images
            @"image.cache": ^(NSArray *args, DSTDone done) {
                DSTImageCache(DSTArg(args, 0), DSTArg(args, 1), DSTArg(args, 2), ^(id result, NSString *error) { done(result, error); });
            },
            @"fs.size": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSURL *url = DSTResolvePath(DSTArg(args, 0), &error);
                if (!url) return done(nil, error.localizedDescription);
                unsigned long long total = 0;
                NSDirectoryEnumerator *enumerator = [NSFileManager.defaultManager enumeratorAtPath:url.path];
                while ([enumerator nextObject]) total += [enumerator.fileAttributes fileSize];
                done(@(total), nil);
            },

            // Built-in plugins
            @"builtins.index": ^(NSArray *args, DSTDone done) {
                done(DSTBuiltinIndex(), nil);
            },
            // Code for several plugins in one call (startup asks for every enabled one at once).
            @"builtins.codes": ^(NSArray *args, DSTDone done) {
                NSArray *ids = DSTArg(args, 0);
                if (![ids isKindOfClass:NSArray.class]) return done(nil, @"Expected a list of plugin ids");
                NSMutableDictionary *codes = [NSMutableDictionary dictionary];
                for (NSString *pluginId in ids) {
                    if (![pluginId isKindOfClass:NSString.class]) continue;
                    NSString *code = DSTBuiltinCode(pluginId);
                    if (code) codes[pluginId] = code;
                }
                done(codes, nil);
            },
            @"builtins.code": ^(NSArray *args, DSTDone done) {
                NSString *pluginId = DSTArg(args, 0);
                NSString *code = [pluginId isKindOfClass:NSString.class] ? DSTBuiltinCode(pluginId) : nil;
                done(code, code ? nil : [NSString stringWithFormat:@"No built-in plugin %@", pluginId]);
            },

            // Icon packs
            @"theme.setNative": ^(NSArray *args, DSTDone done) {
                NSError *error;
                BOOL ok = DSTThemeSetNative(DSTArg(args, 0), &error);
                done(NSNull.null, ok ? nil : error.localizedDescription);
            },
            @"theme.nativeInfo": ^(NSArray *args, DSTDone done) {
                done(DSTThemeNativeInfo(), nil);
            },
            // Fonts
            @"fonts.inspect": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSArray *fonts = DSTFontsInspect(DSTArg(args, 0), &error);
                done(fonts, fonts ? nil : error.localizedDescription);
            },
            @"fonts.apply": ^(NSArray *args, DSTDone done) {
                NSError *error;
                NSDictionary *result = DSTFontsApply(DSTArg(args, 0), &error);
                done(result, result ? nil : error.localizedDescription);
            },
            @"fonts.info": ^(NSArray *args, DSTDone done) {
                done(DSTFontsInfo(), nil);
            },
            // Reactor avatars (WhoReacted)
            @"reactions.enable": ^(NSArray *args, DSTDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ done(DSTReactionsEnable(), nil); });
            },
            @"reactions.inspect": ^(NSArray *args, DSTDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ done(DSTReactionsInspect(), nil); });
            },

            // Code blocks
            @"codeblocks.info": ^(NSArray *args, DSTDone done) {
                done(DSTCodeBlocksInfo(), nil);
            },

            // Header badges (Show Badges In Chat)
            @"headerBadges.enable": ^(NSArray *args, DSTDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ done(DSTHeaderBadgesEnable(), nil); });
            },
            @"headerBadges.clear": ^(NSArray *args, DSTDone done) {
                DSTHeaderBadgesClear();
                done(NSNull.null, nil);
            },

            // Icon packs
            @"iconpacks.list": ^(NSArray *args, DSTDone done) {
                done(DSTListIconPacks(), nil);
            },
            @"iconpacks.index": ^(NSArray *args, DSTDone done) {
                NSString *error;
                NSString *packId = DSTArg(args, 0);
                NSDictionary *index = [packId isKindOfClass:NSString.class] ? DSTIconPackIndex(packId, &error) : nil;
                done(index, index ? nil : error ?: @"Invalid icon pack id");
            },

            // App icon (UIKit, so on the main thread)
            @"appicon.list": ^(NSArray *args, DSTDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ done(DSTAppIconInfo(), nil); });
            },
            @"appicon.set": ^(NSArray *args, DSTDone done) {
                NSString *name = DSTArg(args, 0);
                dispatch_async(dispatch_get_main_queue(), ^{
                    [UIApplication.sharedApplication setAlternateIconName:name completionHandler:^(NSError *error) {
                        done(NSNull.null, error.localizedDescription);
                    }];
                });
            },
        };
    });
    return handlers;
}

@implementation DSTBridge

+ (void)handleCall:(NSDictionary *)call completion:(void (^)(NSDictionary *))completion {
    NSString *method = [call[@"method"] isKindOfClass:NSString.class] ? call[@"method"] : nil;
    NSArray *args = [call[@"args"] isKindOfClass:NSArray.class] ? call[@"args"] : @[];
    DSTHandler handler = method ? DSTHandlers()[method] : nil;

    if (!handler) {
        completion(@{ @"error": [NSString stringWithFormat:@"Unknown method %@", method ?: @"(none)"] });
        return;
    }

    @try {
        handler(args, ^(id result, NSString *error) {
            completion(error ? @{ @"error": error } : @{ @"result": result ?: NSNull.null });
        });
    } @catch (NSException *exception) {
        completion(@{ @"error": [NSString stringWithFormat:@"%@: %@", exception.name, exception.reason] });
    }
}

@end
