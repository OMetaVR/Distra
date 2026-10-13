// Built-in plugins, embedded at build time (scripts/build-plugins.mjs ->
// Generated/EmbeddedBuiltins.S). The blob is parsed on first use; JS fetches
// the index at startup and a plugin's code only when it is enabled.

#import "Discordia.h"

extern const char kDiscordiaBuiltins[];
extern const char kDiscordiaBuiltinsEnd[];

static NSDictionary<NSString *, NSDictionary *> *DCDBuiltinPlugins(void) {
    static NSDictionary *plugins;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSData *blob = [NSData dataWithBytesNoCopy:(void *)kDiscordiaBuiltins length:(NSUInteger)(kDiscordiaBuiltinsEnd - kDiscordiaBuiltins) freeWhenDone:NO];
        NSDictionary *root = [NSJSONSerialization JSONObjectWithData:blob options:0 error:nil];
        NSMutableDictionary *byId = [NSMutableDictionary dictionary];
        for (NSDictionary *plugin in root[@"plugins"]) {
            if ([plugin isKindOfClass:NSDictionary.class] && [plugin[@"id"] isKindOfClass:NSString.class]) byId[plugin[@"id"]] = plugin;
        }
        plugins = byId;
        DCDLogNative(@"Loaded %lu built-in plugins", (unsigned long)plugins.count);
    });
    return plugins;
}

NSArray<NSDictionary *> *DCDBuiltinIndex(void) {
    NSMutableArray *index = [NSMutableArray array];
    for (NSDictionary *plugin in DCDBuiltinPlugins().allValues) {
        NSMutableDictionary *entry = [plugin mutableCopy];
        [entry removeObjectForKey:@"code"];
        [index addObject:entry];
    }
    return index;
}

NSString *DCDBuiltinCode(NSString *pluginId) {
    id code = DCDBuiltinPlugins()[pluginId][@"code"];
    return [code isKindOfClass:NSString.class] ? code : nil;
}
