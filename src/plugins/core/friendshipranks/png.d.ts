// esbuild inlines imported PNGs as data: URLs (scripts/build.mjs).
declare module "*.png" {
    const dataUrl: string;
    export default dataUrl;
}
