/**
 * What Tauri's filesystem scope variables actually reach.
 *
 * A recursive wildcard means something completely different depending on which
 * variable precedes it, and getting this wrong shoots correctly written
 * applications. `$APPDATA/**` is an application recursing through its own data
 * directory, which is what the fs plugin exists for. `$HOME/**` is the same
 * syntax pointing at everything the user owns.
 *
 * The distinction is not a judgement call — it is in the resolver source. Every
 * `app_*` directory is the corresponding user directory with the bundle
 * identifier appended:
 *
 *     pub fn app_config_dir(&self) -> Result<PathBuf> {
 *       dirs::config_dir().map(|dir| dir.join(&self.0.config().identifier))
 *     }
 *
 * So `$APPCONFIG` is one application's folder while `$CONFIG` is the directory
 * holding *every* application's configuration. That pair is the trap: they look
 * alike, differ by three characters, and differ enormously in what they grant.
 *
 * Variable list taken from `plugins/fs/build.rs`, which is what the plugin
 * actually accepts.
 */

export type PathScope =
  /** The application's own directory; recursing through it is ordinary. */
  | 'app-owned'
  /** Every application's data, not just this one's. */
  | 'cross-application'
  /** The user's personal files. */
  | 'user-data'
  /** Everything the user owns. */
  | 'user-home'
  /** Recognized, but not a meaningful privacy boundary on its own. */
  | 'other';

/**
 * Every variable the fs plugin accepts, and what it resolves to.
 *
 * A variable absent from this table is not treated as safe — it is treated as
 * unrecognized, and unrecognized means no finding rather than a guess.
 */
export const PATH_VARIABLES: Readonly<Record<string, PathScope>> = {
  // <user dir>/<bundle identifier> — this application only.
  APPCONFIG: 'app-owned',
  APPDATA: 'app-owned',
  APPLOCALDATA: 'app-owned',
  APPCACHE: 'app-owned',
  APPLOG: 'app-owned',
  // Files the application shipped with.
  RESOURCE: 'app-owned',

  // The roots the app-owned directories live inside: every application's data.
  CONFIG: 'cross-application',
  DATA: 'cross-application',
  LOCALDATA: 'cross-application',
  CACHE: 'cross-application',
  LOG: 'cross-application',

  HOME: 'user-home',

  DOCUMENT: 'user-data',
  DOWNLOAD: 'user-data',
  DESKTOP: 'user-data',
  PICTURE: 'user-data',
  VIDEO: 'user-data',
  AUDIO: 'user-data',
  PUBLIC: 'user-data',

  TEMPLATE: 'other',
  FONT: 'other',
  EXE: 'other',
  RUNTIME: 'other',
  TEMP: 'other',
};

/** A leading `$VARIABLE`, if the pattern starts with one. */
export function leadingVariable(pattern: string): string | undefined {
  const match = /^\$([A-Z]+)\b/.exec(pattern.trim());
  return match?.[1];
}

/**
 * Does this pattern recurse without bound?
 *
 * `**` crosses directory boundaries; a single `*` does not, so `$HOME/*` lists
 * the home directory itself but reaches nothing inside its subdirectories.
 * Treating those alike would flag a deliberately shallow scope.
 */
export function isRecursive(pattern: string): boolean {
  return pattern.includes('**');
}

/** Reaches the whole filesystem regardless of any variable. */
export function isFilesystemWide(pattern: string): boolean {
  const trimmed = pattern.trim();
  return (
    trimmed === '**' ||
    trimmed === '*' ||
    trimmed === '/**' ||
    trimmed === '/' ||
    trimmed === '/**/*' ||
    trimmed === '**/*'
  );
}
