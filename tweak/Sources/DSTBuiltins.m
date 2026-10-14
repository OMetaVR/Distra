// Built-in plugins, embedded at build time (scripts/build-plugins.mjs ->
// Generated/EmbeddedBuiltins.S). The blob is parsed on first use; JS fetches
// the index at startup and a plugin's code only when it is enabled.

#import "Distra.h"

extern const char kDistraBuiltins[];
extern const char kDistraBuiltinsEnd[];

static NSDictionary<NSString *, NSDictionary *> *DSTBuiltinPlugins(void) {
    static NSDictionary *plugins;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSData *blob = [NSData dataWithBytesNoCopy:(void *)kDistraBuiltins length:(NSUInteger)(kDistraBuiltinsEnd - kDistraBuiltins) freeWhenDone:NO];
        NSDictionary *root = [NSJSONSerialization JSONObjectWithData:blob options:0 error:nil];
        NSMutableDictionary *byId = [NSMutableDictionary dictionary];
        for (NSDictionary *plugin in root[@"plugins"]) {
            if ([plugin isKindOfClass:NSDictionary.class] && [plugin[@"id"] isKindOfClass:NSString.class]) byId[plugin[@"id"]] = plugin;
        }
        plugins = byId;
        DSTLogNative(@"Loaded %lu built-in plugins", (unsigned long)plugins.count);
    });
    return plugins;
}

NSArray<NSDictionary *> *DSTBuiltinIndex(void) {
    NSMutableArray *index = [NSMutableArray array];
    for (NSDictionary *plugin in DSTBuiltinPlugins().allValues) {
        NSMutableDictionary *entry = [plugin mutableCopy];
        [entry removeObjectForKey:@"code"];
        [index addObject:entry];
    }
    return index;
}

NSString *DSTBuiltinCode(NSString *pluginId) {
    id code = DSTBuiltinPlugins()[pluginId][@"code"];
    return [code isKindOfClass:NSString.class] ? code : nil;
}
