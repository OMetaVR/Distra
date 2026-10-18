// Native colours for themes. Parts of Discord iOS are drawn natively and take their colours from
// +[DCDThemeColor <token>] class methods, named after the semantic colour tokens in camelCase
// (BACKGROUND_BASE_LOWER -> +backgroundBaseLower). The JS theme engine resolves every semantic
// colour through the active theme and sends the table here (theme.setNative); it's also saved to
// Documents/Distra/themes/native.json so it applies from launch, before any JS runs.
//
// Methods are replaced the first time the table names them, and fall back to Discord's own colour
// for anything the table doesn't have, so clearing the table restores stock colours.

#import "Distra.h"
#import <objc/runtime.h>
#import <os/lock.h>

static os_unfair_lock gLock = OS_UNFAIR_LOCK_INIT;
static NSDictionary<NSString *, UIColor *> *gColors;
static NSMutableSet<NSString *> *gReplaced;

static NSURL *DSTThemeNativeURL(void) {
    return [DSTRootURL() URLByAppendingPathComponent:@"themes/native.json"];
}

/** "#rgb", "#rrggbb" or "#rrggbbaa". */
static UIColor *DSTColorFromHex(NSString *hex) {
    if (![hex isKindOfClass:NSString.class] || ![hex hasPrefix:@"#"]) return nil;
    NSString *digits = [hex substringFromIndex:1];
    if (digits.length == 3) {
        digits = [NSString stringWithFormat:@"%C%C%C%C%C%C", [digits characterAtIndex:0], [digits characterAtIndex:0],
                  [digits characterAtIndex:1], [digits characterAtIndex:1], [digits characterAtIndex:2], [digits characterAtIndex:2]];
    }
    if (digits.length == 6) digits = [digits stringByAppendingString:@"ff"];
    if (digits.length != 8) return nil;
    unsigned long long value = 0;
    if (![[NSScanner scannerWithString:digits] scanHexLongLong:&value]) return nil;
    return [UIColor colorWithRed:((value >> 24) & 0xff) / 255.0
                           green:((value >> 16) & 0xff) / 255.0
                            blue:((value >> 8) & 0xff) / 255.0
                           alpha:(value & 0xff) / 255.0];
}

static BOOL DSTIsColorGetter(Method method) {
    // A class method taking no arguments and returning an object: "@16@0:8".
    if (method_getNumberOfArguments(method) != 2) return NO;
    char type[8] = {0};
    method_getReturnType(method, type, sizeof(type));
    return type[0] == '@';
}

/** Replaces the getters for `names` that aren't replaced yet. */
static void DSTReplaceGetters(NSSet<NSString *> *names) {
    Class cls = NSClassFromString(@"DCDThemeColor");
    if (!cls || !names.count) return;
    Class meta = object_getClass(cls);

    unsigned int count = 0;
    Method *methods = class_copyMethodList(meta, &count);
    for (unsigned int i = 0; i < count; i++) {
        Method method = methods[i];
        SEL selector = method_getName(method);
        NSString *name = NSStringFromSelector(selector);
        if (![names containsObject:name] || [gReplaced containsObject:name] || !DSTIsColorGetter(method)) continue;

        typedef id (*Getter)(id, SEL);
        Getter original = (Getter)method_getImplementation(method);
        id block = ^id(id self) {
            os_unfair_lock_lock(&gLock);
            UIColor *color = gColors[name];
            os_unfair_lock_unlock(&gLock);
            return color ?: original(self, selector);
        };
        method_setImplementation(method, imp_implementationWithBlock(block));
        [gReplaced addObject:name];
    }
    free(methods);
}

/** Installs `table` ({ camelCaseToken: "#rrggbbaa" }); an empty table restores Discord's colours. */
static void DSTThemeApplyTable(NSDictionary *table) {
    NSMutableDictionary<NSString *, UIColor *> *colors = [NSMutableDictionary dictionary];
    if ([table isKindOfClass:NSDictionary.class]) {
        [table enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
            UIColor *color = [key isKindOfClass:NSString.class] ? DSTColorFromHex(value) : nil;
            if (color) colors[key] = color;
        }];
    }
    os_unfair_lock_lock(&gLock);
    gColors = colors;
    os_unfair_lock_unlock(&gLock);

    void (^replace)(void) = ^{
        if (!gReplaced) gReplaced = [NSMutableSet set];
        DSTReplaceGetters([NSSet setWithArray:colors.allKeys]);
    };
    if (NSThread.isMainThread) replace();
    else dispatch_sync(dispatch_get_main_queue(), replace);
}

void DSTThemeLoadSaved(void) {
    if (DSTBootGuard.shared.mode != DSTBootModeNormal) return;
    NSDictionary *saved = DSTReadJSONObject(DSTThemeNativeURL());
    NSDictionary *colors = saved[@"colors"];
    if (![colors isKindOfClass:NSDictionary.class] || !colors.count) return;
    DSTThemeApplyTable(colors);
    DSTLogNative(@"Theme: %lu native colours from %@", (unsigned long)colors.count, saved[@"name"] ?: @"(unnamed)");
}

BOOL DSTThemeSetNative(NSDictionary *payload, NSError **error) {
    NSDictionary *colors = [payload isKindOfClass:NSDictionary.class] ? payload[@"colors"] : nil;
    if (colors && ![colors isKindOfClass:NSDictionary.class]) {
        if (error) *error = DSTError(@"colors must be an object");
        return NO;
    }
    DSTThemeApplyTable(colors ?: @{});
    if (colors.count) return DSTWriteJSONObject(payload, DSTThemeNativeURL(), error);
    [NSFileManager.defaultManager removeItemAtURL:DSTThemeNativeURL() error:nil];
    return YES;
}

NSDictionary *DSTThemeNativeInfo(void) {
    Class cls = NSClassFromString(@"DCDThemeColor");
    NSMutableArray<NSString *> *getters = [NSMutableArray array];
    if (cls) {
        unsigned int count = 0;
        Method *methods = class_copyMethodList(object_getClass(cls), &count);
        for (unsigned int i = 0; i < count; i++) {
            if (DSTIsColorGetter(methods[i])) [getters addObject:NSStringFromSelector(method_getName(methods[i]))];
        }
        free(methods);
    }
    [getters sortUsingSelector:@selector(compare:)];
    os_unfair_lock_lock(&gLock);
    NSUInteger active = gColors.count;
    os_unfair_lock_unlock(&gLock);
    return @{
        @"classFound": @(cls != nil),
        @"getters": getters,
        @"replaced": @(gReplaced.count),
        @"activeColors": @(active),
    };
}
