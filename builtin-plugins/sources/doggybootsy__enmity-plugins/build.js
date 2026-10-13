const { execSync } = require("child_process");

// Extract recognized Rollup CLI options
const rollupArgs = process.argv.slice(2).filter(arg => !arg.startsWith("--project=") && arg !== "--production");

const args = process.argv.find(arg => arg.startsWith("--project="));
const packageName = args ? args.split("=")[1] : "silent-typing";

// Execute Rollup with filtered arguments
execSync(`rollup -c  --configPlugin esbuild ${rollupArgs.join(" ")}`, { stdio: "inherit", env: { ...process.env, PACKAGE: packageName, PROD: process.argv.includes("--production").toString() } });
