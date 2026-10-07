// The agent that works the studio's batches. The studio says « l'agent », not « Claude » (user request: « si je veux
// utiliser GPT plutôt que Claude un jour »): any coding agent that can run the commands of AGENT.md will do.
// Two are known (their skills folder is what the update check looks at); another one is shown by its own name.
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
export const AGENTS = {
  claude: { id: 'claude', name: 'Claude Code', label: 'Claude Code', skills: path.join(home, '.claude', 'skills') },
  // Codex also reads the shared folder ~/.agents/skills, where the `skills` tool now installs its global skills
  // (it treats Codex as a « universal » agent); ~/.codex/skills keeps the older copies and the project's skill.
  codex: { id: 'codex', name: 'Codex', label: 'Codex (GPT)', skills: path.join(home, '.codex', 'skills'), alsoReads: [path.join(home, '.agents', 'skills')] },
};
// every folder an agent loads skills from (its own first)
export const skillDirsOf = (A) => [A?.skills, ...(A?.alsoReads ?? [])].filter(Boolean);
export const agentById = (id) => AGENTS[id] ?? (id ? { id, name: id, skills: null } : null);

// who is running this command (studio-cli.mjs wait / reply…): STUDIO_AGENT=claude|codex overrides; then the AI_AGENT
// convention (« claude-code_2-1-280_agent », « codex_… »); then each agent's own markers. Never a bare « CODEX_ »
// prefix: some hosts set CODEX_* variables around a Claude Code session.
export function detectAgent(env = process.env) {
  if (env.STUDIO_AGENT) return agentById(env.STUDIO_AGENT.toLowerCase());
  const ai = (env.AI_AGENT ?? '').toLowerCase();
  if (ai.startsWith('claude')) return AGENTS.claude;
  if (ai.startsWith('codex') || ai.startsWith('openai')) return AGENTS.codex;
  if (ai) return { id: ai.split(/[_\s]/)[0], name: ai.split(/[_\s]/)[0], skills: null };
  if (env.CLAUDECODE || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_CODE_ENTRYPOINT) return AGENTS.claude;
  if (env.CODEX_THREAD_ID || env.CODEX_SANDBOX || env.CODEX_SESSION_ID || env.CODEX_MANAGED_BY_NPM) return AGENTS.codex;
  return null;
}
