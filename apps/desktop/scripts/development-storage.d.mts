/** Desktop development storage configuration for the ESM launcher. */
/**
 * Configure process-local temporary directories and npm cache.
 * @param buildRoot - Desktop build directory in the workspace.
 * @param env - Mutable process environment; defaults to process.env.
 * @returns Created absolute scratch directory.
 */
export function configureDevelopmentStorage(buildRoot: string, env?: NodeJS.ProcessEnv): string
