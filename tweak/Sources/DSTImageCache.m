// Downloads an image and stores a downscaled JPEG under Documents/Distra
// (bridge method `image.cache`). Optionally greyscales and dims it, which is how
// the message logger shows deleted images.

#import "Distra.h"
#import <CoreImage/CoreImage.h>

static UIImage *DSTProcessImage(UIImage *image, CGFloat maxSize, BOOL greyscale, CGFloat alpha) {
    CGSize size = image.size;
    CGFloat scale = MIN(1.0, maxSize / MAX(size.width, size.height));
    CGSize target = CGSizeMake(floor(size.width * scale), floor(size.height * scale));

    if (greyscale) {
        CIImage *input = [CIImage imageWithCGImage:image.CGImage];
        CIFilter *filter = [CIFilter filterWithName:@"CIPhotoEffectMono"];
        [filter setValue:input forKey:kCIInputImageKey];
        CIImage *output = filter.outputImage;
        CGImageRef cg = output ? [[CIContext contextWithOptions:nil] createCGImage:output fromRect:output.extent] : NULL;
        if (cg) {
            image = [UIImage imageWithCGImage:cg scale:image.scale orientation:image.imageOrientation];
            CGImageRelease(cg);
        }
    }

    UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat preferredFormat];
    format.scale = 1;
    format.opaque = YES;
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:target format:format];
    return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
        // Dimmed images are drawn over a dark background so they read as "gone".
        [[UIColor colorWithWhite:0.12 alpha:1] setFill];
        [context fillRect:CGRectMake(0, 0, target.width, target.height)];
        [image drawInRect:CGRectMake(0, 0, target.width, target.height) blendMode:kCGBlendModeNormal alpha:alpha];
    }];
}

void DSTImageCache(NSString *urlString, NSString *relativePath, NSDictionary *options, void (^done)(id result, NSString *error)) {
    NSError *pathError;
    NSURL *destination = DSTResolvePath(relativePath, &pathError);
    NSURL *url = [urlString isKindOfClass:NSString.class] ? [NSURL URLWithString:urlString] : nil;
    if (!destination) return done(nil, pathError.localizedDescription);
    if (!url.scheme) return done(nil, @"Invalid URL");

    CGFloat maxSize = [options[@"maxSize"] doubleValue] ?: 720;
    CGFloat quality = [options[@"quality"] doubleValue] ?: 0.7;
    BOOL greyscale = [options[@"greyscale"] boolValue];
    CGFloat alpha = options[@"alpha"] ? [options[@"alpha"] doubleValue] : 1.0;

    NSURLRequest *request = [NSURLRequest requestWithURL:url cachePolicy:NSURLRequestReturnCacheDataElseLoad timeoutInterval:20];
    [[NSURLSession.sharedSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 200;
        UIImage *image = data && status < 400 ? [UIImage imageWithData:data] : nil;
        if (!image) return done(nil, error.localizedDescription ?: [NSString stringWithFormat:@"Could not load image (HTTP %ld)", (long)status]);

        UIImage *processed = DSTProcessImage(image, maxSize, greyscale, alpha);
        NSData *jpeg = UIImageJPEGRepresentation(processed, quality);
        NSError *writeError;
        if (!jpeg || !DSTWriteData(jpeg, destination, &writeError)) return done(nil, writeError.localizedDescription ?: @"Could not encode image");

        done(@{
            @"uri": destination.absoluteString,
            @"width": @(processed.size.width),
            @"height": @(processed.size.height),
            @"bytes": @(jpeg.length),
        }, nil);
    }] resume];
}
