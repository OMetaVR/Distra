#import "Discordia.h"
#import <dlfcn.h>

os_log_t DCDLog(void) {
    static os_log_t log;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ log = os_log_create("dev.discordia", "Discordia"); });
    return log;
}

NSError *DCDError(NSString *message) {
    return [NSError errorWithDomain:@"dev.discordia" code:1 userInfo:@{ NSLocalizedDescriptionKey: message ?: @"Unknown error" }];
}

NSURL *DCDRootURL(void) {
    static NSURL *root;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSURL *documents = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
        root = [documents URLByAppendingPathComponent:@"Discordia" isDirectory:YES];
        [NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil];
    });
    return root;
}

NSURL *DCDResolvePath(NSString *relativePath, NSError **error) {
    if (![relativePath isKindOfClass:NSString.class] || relativePath.length == 0 || [relativePath hasPrefix:@"/"] || [relativePath containsString:@"\0"]) {
        if (error) *error = DCDError(@"Invalid path");
        return nil;
    }

    NSString *rootPath = DCDRootURL().path.stringByStandardizingPath;
    NSString *resolved = [rootPath stringByAppendingPathComponent:relativePath].stringByStandardizingPath;
    if (![resolved hasPrefix:[rootPath stringByAppendingString:@"/"]]) {
        if (error) *error = DCDError(@"Path escapes the Discordia folder");
        return nil;
    }
    return [NSURL fileURLWithPath:resolved];
}

BOOL DCDWriteData(NSData *data, NSURL *url, NSError **error) {
    NSURL *directory = url.URLByDeletingLastPathComponent;
    if (![NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:error]) return NO;
    return [data writeToURL:url options:NSDataWritingAtomic error:error];
}

NSDictionary *DCDReadJSONObject(NSURL *url) {
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) return nil;
    id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [object isKindOfClass:NSDictionary.class] ? object : nil;
}

BOOL DCDWriteJSONObject(id object, NSURL *url, NSError **error) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:NSJSONWritingPrettyPrinted error:error];
    return data && DCDWriteData(data, url, error);
}

BOOL DCDIsJailbroken(void) {
    static BOOL jailbroken;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // Jailbreak installs load from the tweak injection folder. Anything else
        // (injected into the IPA, or loaded by LiveContainer from its Tweaks folder) isn't one.
        Dl_info info;
        if (dladdr((const void *)&DCDIsJailbroken, &info) && info.dli_fname) {
            NSString *imagePath = @(info.dli_fname).stringByResolvingSymlinksInPath;
            for (NSString *prefix in @[@"/Library/MobileSubstrate/", @"/var/jb/", @"/private/preboot/"]) {
                if ([imagePath hasPrefix:prefix]) jailbroken = YES;
            }
        }
    });
    return jailbroken;
}
