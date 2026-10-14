#import "Distra.h"
#import <dlfcn.h>

os_log_t DSTLog(void) {
    static os_log_t log;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ log = os_log_create("dev.distra", "Distra"); });
    return log;
}

NSError *DSTError(NSString *message) {
    return [NSError errorWithDomain:@"dev.distra" code:1 userInfo:@{ NSLocalizedDescriptionKey: message ?: @"Unknown error" }];
}

NSURL *DSTRootURL(void) {
    static NSURL *root;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSURL *documents = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
        root = [documents URLByAppendingPathComponent:@"Distra" isDirectory:YES];
        // Installs from before the rename kept everything in Documents/Discordia.
        NSURL *legacy = [documents URLByAppendingPathComponent:@"Discordia" isDirectory:YES];
        if (![NSFileManager.defaultManager fileExistsAtPath:root.path] && [NSFileManager.defaultManager fileExistsAtPath:legacy.path]) {
            [NSFileManager.defaultManager moveItemAtURL:legacy toURL:root error:nil];
        }
        [NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil];
    });
    return root;
}

NSURL *DSTResolvePath(NSString *relativePath, NSError **error) {
    if (![relativePath isKindOfClass:NSString.class] || relativePath.length == 0 || [relativePath hasPrefix:@"/"] || [relativePath containsString:@"\0"]) {
        if (error) *error = DSTError(@"Invalid path");
        return nil;
    }

    NSString *rootPath = DSTRootURL().path.stringByStandardizingPath;
    NSString *resolved = [rootPath stringByAppendingPathComponent:relativePath].stringByStandardizingPath;
    if (![resolved hasPrefix:[rootPath stringByAppendingString:@"/"]]) {
        if (error) *error = DSTError(@"Path escapes the Distra folder");
        return nil;
    }
    return [NSURL fileURLWithPath:resolved];
}

BOOL DSTWriteData(NSData *data, NSURL *url, NSError **error) {
    NSURL *directory = url.URLByDeletingLastPathComponent;
    if (![NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:error]) return NO;
    return [data writeToURL:url options:NSDataWritingAtomic error:error];
}

NSDictionary *DSTReadJSONObject(NSURL *url) {
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) return nil;
    id object = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [object isKindOfClass:NSDictionary.class] ? object : nil;
}

BOOL DSTWriteJSONObject(id object, NSURL *url, NSError **error) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:NSJSONWritingPrettyPrinted error:error];
    return data && DSTWriteData(data, url, error);
}

BOOL DSTIsJailbroken(void) {
    static BOOL jailbroken;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        // Jailbreak installs load from the tweak injection folder. Anything else
        // (injected into the IPA, or loaded by LiveContainer from its Tweaks folder) isn't one.
        Dl_info info;
        if (dladdr((const void *)&DSTIsJailbroken, &info) && info.dli_fname) {
            NSString *imagePath = @(info.dli_fname).stringByResolvingSymlinksInPath;
            for (NSString *prefix in @[@"/Library/MobileSubstrate/", @"/var/jb/", @"/private/preboot/"]) {
                if ([imagePath hasPrefix:prefix]) jailbroken = YES;
            }
        }
    });
    return jailbroken;
}
