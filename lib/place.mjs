// Where this copy of Coulisses (formerly « Brambleshire Studio ») lives, and what follows from it.
//   - the Dev workshop (…\Dev\remotion-studio): sandbox, tests, port 4174, cache in .cache\
//   - the installed app (user choice: C:\Users\owner\AppData\Local\Programs\Coulisses\, by install.mjs, which writes
//     installed.json there): the real episodes and projects, port 4173 (the review tool's port: finish-render.sh's check
//     stays valid), and its data OUTSIDE every project, in %LOCALAPPDATA%\Coulisses\ — the cache holds a junction to
//     06_Remotion\public (≈ 3 GB of art), which must never sit inside a folder that someone may clean recursively.
//   - an old install inside the Brambleshire pipeline (…\06_Remotion\review\studio) is still recognised.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD_PLACE = path.basename(path.resolve(STUDIO, '..', '..')).toLowerCase() === '06_remotion';
export const INSTALLED = OLD_PLACE || fs.existsSync(path.join(STUDIO, 'installed.json'));
export const INSTALLED_THEATRE = OLD_PLACE ? path.resolve(STUDIO, '..', '..', '..') : null;
export const DEFAULT_PORT = INSTALLED ? 4173 : 4174;
export const APP_NAME = 'Coulisses';
export const DATA = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), APP_NAME);   // the installed app's data
const tag = crypto.createHash('sha1').update(STUDIO.toLowerCase()).digest('hex').slice(0, 8);
export const CACHE = INSTALLED ? path.join(DATA, `cache-${tag}`) : path.join(STUDIO, '.cache');
// the list of imported projects (lib/projects.mjs): one per copy, so the Dev workshop's tests never touch the user's
// list. STUDIO_PROJECTS overrides it (tests).
export const PROJECTS_FILE = process.env.STUDIO_PROJECTS ?? path.join(INSTALLED ? DATA : CACHE, 'projets.json');

// a note left in the cache, next to the junction
export function cacheReadme() {
  const f = path.join(CACHE, 'LISEZMOI.txt');
  if (fs.existsSync(f)) return;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(f, [
    'Cache de Coulisses (studio de revue) : aperçus compilés, bundles Remotion, formes d\'onde, copies de revue des vidéos.',
    `Coulisses : ${STUDIO}`,
    'Tout ce dossier peut être supprimé : Coulisses le refait.',
    'ATTENTION : les dossiers bundle*\\public sont des JONCTIONS vers les dossiers public des projets Remotion (leurs images).',
    'Pour supprimer ce dossier : l\'Explorateur Windows, ou « rmdir /s /q » dans cmd. Ne pas utiliser « Remove-Item -Recurse » de Windows PowerShell 5,',
    'qui peut suivre la jonction et effacer les images du projet.',
    '',
  ].join('\r\n'));
}
