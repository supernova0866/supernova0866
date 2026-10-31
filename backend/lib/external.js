import { q, exec } from './db.js';

const nowSec = () => Math.floor(Date.now() / 1000);
const UA = 'supernova-site';

export async function bump(env, key) {
  const month = new Date().toISOString().slice(0, 7);
  await exec(
    env,
    'INSERT INTO usage(month, key, count) VALUES(?,?,1) ON CONFLICT(month, key) DO UPDATE SET count = count + 1',
    [month, key]
  );
}

export async function cached(env, key, ttlSec, fn) {
  const hit = await q(env, 'SELECT value FROM cache WHERE key=? AND expires_at>?', [key, nowSec()]);
  if (hit[0]) return JSON.parse(hit[0].value);
  const value = await fn();
  await exec(
    env,
    'INSERT INTO cache(key, value, expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at',
    [key, JSON.stringify(value), nowSec() + ttlSec]
  );
  return value;
}

export const emptyStats = () => ({
  repos_count: 0, stars_count: 0, commits_count: 0, followers_count: 0,
  languages: [], repositories: [], configured: false,
});

const GQL = `query($login:String!){
  user(login:$login){
    followers{ totalCount }
    contributionsCollection{ totalCommitContributions }
    repositories(first:100, ownerAffiliations:OWNER, privacy:PUBLIC, orderBy:{field:UPDATED_AT, direction:DESC}){
      totalCount
      nodes{
        name url description stargazerCount forkCount updatedAt isFork
        primaryLanguage{ name }
        languages(first:6, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } }
      }
    }
  }
}`;

export async function githubStats(env) {
  if (!env.GITHUB_USER || !env.GITHUB_TOKEN) return emptyStats();
  return cached(env, 'github:stats', 1800, async () => {
    await bump(env, 'github');
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${env.GITHUB_TOKEN}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GQL, variables: { login: env.GITHUB_USER } }),
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const user = (await res.json())?.data?.user;
    if (!user) throw new Error('GitHub user not found');

    const repos = user.repositories.nodes.filter((r) => !r.isFork);
    const bytes = {};
    for (const r of repos) {
      for (const e of r.languages.edges) bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size;
    }
    const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
    const languages = Object.entries(bytes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, n]) => ({ name, ratio: Math.round((n / total) * 1000) / 10 }));

    return {
      repos_count: user.repositories.totalCount,
      stars_count: repos.reduce((a, r) => a + r.stargazerCount, 0),
      commits_count: user.contributionsCollection.totalCommitContributions, // last 12 months only
      followers_count: user.followers.totalCount,
      languages,
      repositories: repos.slice(0, 8).map((r) => ({
        name: r.name,
        url: r.url,
        description: r.description,
        stars: r.stargazerCount,
        forks: r.forkCount,
        language: r.primaryLanguage?.name || null,
        updated_at: r.updatedAt,
      })),
      configured: true,
    };
  });
}

export async function nowPlaying(env, username) {
  if (!env.LASTFM_API_KEY || !username) return { isPlaying: false };
  return cached(env, 'lastfm:now:' + username.toLowerCase(), 20, async () => {
    await bump(env, 'lastfm');
    const u = new URL('https://ws.audioscrobbler.com/2.0/');
    u.searchParams.set('method', 'user.getrecenttracks');
    u.searchParams.set('user', username);
    u.searchParams.set('api_key', env.LASTFM_API_KEY);
    u.searchParams.set('format', 'json');
    u.searchParams.set('limit', '1');
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);
    const t = (await res.json())?.recenttracks?.track;
    const track = Array.isArray(t) ? t[0] : t;
    if (!track || track['@attr']?.nowplaying !== 'true') return { isPlaying: false };
    return {
      isPlaying: true,
      song: track.name,
      artist: track.artist?.['#text'] || '',
      album: track.album?.['#text'] || '',
    };
  });
}
