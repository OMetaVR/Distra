// Native functions callable from JS through the hooked
// RCTFileReaderModule.readAsDataURL (see Tweak.x and src/core/bridge.ts).
// Every handler receives the JS arguments and calls `done(result, error)`.

#import "Discordia.h"

typedef void (^DCDDone)(id result, NSString *error);
typedef void (^DCDHandler)(NSArray *args, DCDDone done);

static id DCDArg(NSArray *args, NSUInteger index) {
    id value = index < args.count ? args[index] : nil;
    return value == NSNull.null ? nil : value;
}

#pragma mark - Icon packs

/** Directories that may contain icon packs, in priority order. */
static NSArray<NSDictionary *> *DCDIconPackRoots(void) {
    NSMutableArray *roots = [NSMutableArray arrayWithObject:@{
        @"source": @"documents",
        @"url": [DCDRootURL() URLByAppendingPathComponent:@"IconPacks" isDirectory:YES],
    }];
    [roots addObject:@{
        @"source": @"bundled",
        @"url": [NSBundle.mainBundle.bundleURL URLByAppendingPathComponent:@"DiscordiaIconPacks" isDirectory:YES],
    }];
    if (DCDIsJailbroken()) {
        NSString *path = [@DISCORDIA_INSTALL_PREFIX stringByAppendingPathComponent:@"/Library/Application Support/Discordia/IconPacks"];
        [roots addObject:@{ @"source": @"bundled", @"url": [NSURL fileURLWithPath:path isDirectory:YES] }];
    }
    return roots;
}

static NSArray<NSDictionary *> *DCDListIconPacks(void) {
    NSMutableArray *packs = [NSMutableArray array];
    NSMutableSet *seen = [NSMutableSet set];
    for (NSDictionary *root in DCDIconPackRoots()) {
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

static NSDictionary *DCDIconPackIndex(NSString *packId, NSString **error) {
    NSDictionary *pack;
    for (NSDictionary *candidate in DCDListIconPacks()) {
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

static NSDictionary *DCDAppIconInfo(void) {
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

static NSDictionary<NSString *, DCDHandler> *DCDHandlers(void) {
    static NSDictionary *handlers;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        handlers = @{
            // Files, sandboxed to Documents/Discordia
            @"fs.read": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                NSString *contents = url ? [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&error] : nil;
                done(contents, contents ? nil : error.localizedDescription);
            },
            @"fs.write": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                NSString *contents = DCDArg(args, 1);
                if (url && ![contents isKindOfClass:NSString.class]) error = DCDError(@"Contents must be a string");
                BOOL ok = url && !error && DCDWriteData([contents dataUsingEncoding:NSUTF8StringEncoding], url, &error);
                done(NSNull.null, ok ? nil : error.localizedDescription);
            },
            @"fs.exists": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                done(@(url && [NSFileManager.defaultManager fileExistsAtPath:url.path]), url ? nil : error.localizedDescription);
            },
            @"fs.remove": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                if (url && [NSFileManager.defaultManager fileExistsAtPath:url.path]) [NSFileManager.defaultManager removeItemAtURL:url error:&error];
                done(NSNull.null, url && !error ? nil : error.localizedDescription);
            },
            @"fs.list": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                NSArray *names = url ? [NSFileManager.defaultManager contentsOfDirectoryAtPath:url.path error:&error] : nil;
                done(names, names ? nil : error.localizedDescription);
            },

            // Loader
            @"loader.getConfig": ^(NSArray *args, DCDDone done) {
                done(DCDLoaderConfig(), nil);
            },
            @"loader.setConfig": ^(NSArray *args, DCDDone done) {
                NSError *error;
                BOOL ok = DCDSetLoaderConfig(DCDArg(args, 0), &error);
                done(NSNull.null, ok ? nil : error.localizedDescription);
            },
            @"boot.markStable": ^(NSArray *args, DCDDone done) {
                [DCDBootGuard.shared markStable];
                done(NSNull.null, nil);
            },

            // Diagnostics
            @"log.write": ^(NSArray *args, DCDDone done) {
                NSArray *entries = DCDArg(args, 0);
                if ([entries isKindOfClass:NSArray.class]) {
                    for (NSDictionary *entry in entries) {
                        if (![entry isKindOfClass:NSDictionary.class]) continue;
                        NSString *message = [NSString stringWithFormat:@"[%@] %@", entry[@"tag"] ?: @"?", entry[@"message"] ?: @""];
                        [DCDDiagnostics.shared log:message source:@"js" level:[entry[@"level"] description]];
                    }
                }
                done(NSNull.null, nil);
            },
            @"diag.ready": ^(NSArray *args, DCDDone done) {
                NSDictionary *status = DCDArg(args, 0);
                if ([status isKindOfClass:NSDictionary.class]) [DCDDiagnostics.shared recordJSStatus:status];
                done(NSNull.null, nil);
            },
            @"diag.showLogs": ^(NSArray *args, DCDDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ [DCDDiagnostics.shared presentViewer]; });
                done(NSNull.null, nil);
            },

            // SQLite
            @"db.exec": ^(NSArray *args, DCDDone done) {
                DCDDatabaseExecute(DCDArg(args, 0), DCDArg(args, 1), DCDArg(args, 2), ^(id result, NSString *error) { done(result, error); });
            },
            @"db.batch": ^(NSArray *args, DCDDone done) {
                DCDDatabaseBatch(DCDArg(args, 0), DCDArg(args, 1), ^(id result, NSString *error) { done(result, error); });
            },
            @"db.size": ^(NSArray *args, DCDDone done) {
                NSString *name = DCDArg(args, 0);
                done([name isKindOfClass:NSString.class] ? DCDDatabaseSize(name) : @0, nil);
            },

            // Images
            @"image.cache": ^(NSArray *args, DCDDone done) {
                DCDImageCache(DCDArg(args, 0), DCDArg(args, 1), DCDArg(args, 2), ^(id result, NSString *error) { done(result, error); });
            },
            @"fs.size": ^(NSArray *args, DCDDone done) {
                NSError *error;
                NSURL *url = DCDResolvePath(DCDArg(args, 0), &error);
                if (!url) return done(nil, error.localizedDescription);
                unsigned long long total = 0;
                NSDirectoryEnumerator *enumerator = [NSFileManager.defaultManager enumeratorAtPath:url.path];
                while ([enumerator nextObject]) total += [enumerator.fileAttributes fileSize];
                done(@(total), nil);
            },

            // Built-in plugins
            @"builtins.index": ^(NSArray *args, DCDDone done) {
                done(DCDBuiltinIndex(), nil);
            },
            @"builtins.code": ^(NSArray *args, DCDDone done) {
                NSString *pluginId = DCDArg(args, 0);
                NSString *code = [pluginId isKindOfClass:NSString.class] ? DCDBuiltinCode(pluginId) : nil;
                done(code, code ? nil : [NSString stringWithFormat:@"No built-in plugin %@", pluginId]);
            },

            // Icon packs
            @"iconpacks.list": ^(NSArray *args, DCDDone done) {
                done(DCDListIconPacks(), nil);
            },
            @"iconpacks.index": ^(NSArray *args, DCDDone done) {
                NSString *error;
                NSString *packId = DCDArg(args, 0);
                NSDictionary *index = [packId isKindOfClass:NSString.class] ? DCDIconPackIndex(packId, &error) : nil;
                done(index, index ? nil : error ?: @"Invalid icon pack id");
            },

            // App icon (UIKit, so on the main thread)
            @"appicon.list": ^(NSArray *args, DCDDone done) {
                dispatch_async(dispatch_get_main_queue(), ^{ done(DCDAppIconInfo(), nil); });
            },
            @"appicon.set": ^(NSArray *args, DCDDone done) {
                NSString *name = DCDArg(args, 0);
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

@implementation DCDBridge

+ (void)handleCall:(NSDictionary *)call completion:(void (^)(NSDictionary *))completion {
    NSString *method = [call[@"method"] isKindOfClass:NSString.class] ? call[@"method"] : nil;
    NSArray *args = [call[@"args"] isKindOfClass:NSArray.class] ? call[@"args"] : @[];
    DCDHandler handler = method ? DCDHandlers()[method] : nil;

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
