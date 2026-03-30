
const path = require('path');

function initialState(session) {
  return {
    cwd: '/home/student',
    user: 'student',
    host: 'labforge-cli',
    score: 0,
    found: [],
    notes: [],
    templateId: session.templateId,
    targetUrl: session.targetUrl,
    readmeHint: 'Read the scenario notes, enumerate carefully, and keep an eye on authentication and data ownership flaws.',
  };
}

function norm(p, cwd) {
  if (!p || p === '.') return cwd;
  if (p === '..') return path.posix.dirname(cwd === '/' ? '/' : cwd);
  return p.startsWith('/') ? path.posix.normalize(p) : path.posix.normalize(path.posix.join(cwd, p));
}

const FS = {
  '/': ['home','etc','var','opt'],
  '/home': ['student'],
  '/home/student': ['notes.txt','targets.txt','tools.txt'],
  '/etc': ['hosts','passwd'],
  '/var': ['log','www'],
  '/var/log': ['app.log','access.log'],
  '/var/www': ['html'],
  '/var/www/html': ['index.php','admin','config.php'],
  '/var/www/html/admin': ['users.txt','backup.env'],
  '/opt': ['hints'],
  '/opt/hints': ['stage1.txt','stage2.txt']
};

const FILES = {
  '/home/student/notes.txt': 'LabForge classroom CLI sandbox\nUse recon first, then validate exploit path.\n',
  '/home/student/targets.txt': 'Target: dynamic student instance\nUse the target URL shown in the classroom workbench.\n',
  '/home/student/tools.txt': 'Allowed vibe: curl, nmap, ffuf, sqlmap, jwt-tool, burpsuite, grep, cat, ls, find\n',
  '/etc/hosts': '127.0.0.1 localhost\n10.10.10.20 internal-api\n10.10.10.42 admin.lab\n',
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\napp:x:1000:1000:app:/srv/app:/bin/sh\nstudent:x:1001:1001:student:/home/student:/bin/bash\n',
  '/var/log/app.log': '[INFO] boot ok\n[WARN] debug token fallback enabled\n',
  '/var/log/access.log': 'GET / 200\nGET /api/users/1 200\nGET /api/users/2 200\n',
  '/var/www/html/config.php': '$db_user="app";\n$db_pass="app123";\n$jwt_secret="labforge-dev-secret";\n',
  '/var/www/html/admin/users.txt': 'alice\nbob\ncharlie\n',
  '/var/www/html/admin/backup.env': 'JWT_SECRET=labforge-dev-secret\nADMIN_EMAIL=admin@labforge.local\n',
  '/opt/hints/stage1.txt': 'Swagger, README, and response patterns are often the first loose threads.\n',
  '/opt/hints/stage2.txt': 'When auth feels flimsy, look at tokens, headers, and ownership checks.\n',
};

function award(state, tag, points, desc) {
  if (state.found.includes(tag)) return null;
  state.found.push(tag);
  state.score += points;
  return { tag, points, desc };
}

function execute(command, state) {
  const cmd = String(command || '').trim();
  const events = [];
  if (!cmd) return { output: '', prompt: `${state.user}@${state.host}:${state.cwd}$`, score: state.score, events };

  let output = '';
  const [base, ...rest] = cmd.split(/\s+/);
  const arg = rest.join(' ');

  if (base === 'help') {
    output = 'Allowed commands: help, pwd, ls, cd, cat, grep, find, curl, nmap, ffuf, sqlmap, jwt-tool, clear, hint, target, score';
  } else if (base === 'pwd') {
    output = state.cwd;
  } else if (base === 'ls') {
    const target = norm(arg || state.cwd, state.cwd);
    output = (FS[target] || []).join('  ') || `ls: cannot access ${target}`;
    if (target === '/var/www/html/admin') {
      const ev = award(state, 'admin-dir', 15, 'Found admin-facing files by enumerating web root');
      if (ev) events.push(ev);
    }
  } else if (base === 'cd') {
    const target = norm(arg || '/home/student', state.cwd);
    if (FS[target]) { state.cwd = target; output = ''; }
    else output = `cd: no such file or directory: ${target}`;
  } else if (base === 'cat') {
    const target = norm(arg, state.cwd);
    output = FILES[target] || `cat: ${target}: No such file`;
    if (target.includes('config.php') || target.includes('backup.env')) {
      const ev = award(state, 'secrets', 35, 'Recovered application secret material from config/backup files');
      if (ev) events.push(ev);
    }
  } else if (base === 'grep') {
    output = 'debug token fallback enabled\nJWT_SECRET=labforge-dev-secret';
    const ev = award(state, 'grep-secrets', 20, 'Used grep-style hunting to spot sensitive debug material');
    if (ev) events.push(ev);
  } else if (base === 'find') {
    output = ['/var/www/html/config.php','/var/www/html/admin/backup.env','/opt/hints/stage1.txt'].join('\n');
    const ev = award(state, 'find', 10, 'Enumerated likely configuration and hint files');
    if (ev) events.push(ev);
  } else if (base === 'curl') {
    output = `HTTP/1.1 200 OK\nserver: labforge-target\nbody: target says hello from ${state.targetUrl || 'http://target.local'}\n`;
    if (/swagger|openapi|api\/docs/i.test(cmd)) {
      const ev = award(state, 'recon-api', 20, 'Discovered API documentation or attack surface with curl');
      if (ev) events.push(ev);
      output += '\nFound endpoints: /api/users/{id}, /api/admin/stats, /api/profile';
    }
    if (/users\/2|users\/3|idor/i.test(cmd)) {
      const ev = award(state, 'idor', 45, 'Demonstrated likely IDOR or broken object access');
      if (ev) events.push(ev);
      output += '\nPotential access control gap: user resource changed without ownership validation.';
    }
    if (/Authorization: Bearer|jwt/i.test(cmd)) {
      const ev = award(state, 'jwt', 35, 'Tested token-oriented auth path');
      if (ev) events.push(ev);
    }
  } else if (base === 'nmap') {
    output = `Starting Nmap\nPORT   STATE SERVICE\n80/tcp open  http\n443/tcp open https\n3000/tcp open node-api\n`;
    const ev = award(state, 'nmap', 15, 'Performed basic service enumeration');
    if (ev) events.push(ev);
  } else if (base === 'ffuf') {
    output = '/admin [Status:200]\n/api/docs [Status:200]\n/internal [Status:403]';
    const ev = award(state, 'ffuf', 18, 'Enumerated hidden paths with web fuzzing');
    if (ev) events.push(ev);
  } else if (base === 'sqlmap') {
    output = 'sqlmap heuristic test suggests injectable parameter: q\nDBMS: PostgreSQL\n';
    const ev = award(state, 'sqli', 40, 'Validated a likely SQL injection path');
    if (ev) events.push(ev);
  } else if (base === 'jwt-tool' || base === 'jwttool') {
    output = 'Header alg mismatch detected\nSecret candidate: labforge-dev-secret';
    const ev = award(state, 'jwt-tool', 25, 'Inspected JWT weaknesses');
    if (ev) events.push(ev);
  } else if (base === 'hint') {
    output = state.readmeHint;
  } else if (base === 'target') {
    output = state.targetUrl || 'No target bound';
  } else if (base === 'score') {
    output = `Current score: ${state.score}`;
  } else if (base === 'clear') {
    output = '__CLEAR__';
  } else {
    output = `${base}: command not available in teaching sandbox`;
  }

  return {
    output,
    prompt: `${state.user}@${state.host}:${state.cwd}$`,
    score: state.score,
    events,
  };
}

module.exports = { initialState, execute };
