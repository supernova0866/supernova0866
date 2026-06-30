// devtools.js - Branded console output & interactive console API
(function() {
  // Print beautiful branded console output on load
  console.log('%c$UPERNOVÆ', 'font-size: 3rem; font-weight: 900; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.4); font-family: monospace;');
  console.log('%cDevTools? Bold of you. 👀', 'color: rgba(255,255,255,0.6); font-size: 13px; font-family: monospace; font-weight: 500;');
  console.log('%cSince you\'re here — try: NovaConsole.exec("help")', 'color: rgba(255,255,255,0.3); font-size: 11px; font-style: italic; font-family: monospace;');

  // Commands map
  const commands = {
    help: {
      desc: 'Show available commands',
      exec: () => {
        console.log('%cAvailable commands:', 'color: rgba(255,255,255,0.8); font-weight: bold;');
        Object.keys(commands).forEach(cmd => {
          console.log(`  %c${cmd.padEnd(12)}%c- ${commands[cmd].desc}`, 'color: #fff; font-weight: bold;', 'color: rgba(255,255,255,0.5);');
        });
        return 'Ready.';
      }
    },
    oblitus: {
      desc: 'Access the hidden realm',
      exec: () => {
        console.log('%cRedirecting to oblitus...', 'color: #3b82f6;');
        sessionStorage.setItem('oblitus:entered', 'true');
        window.location.href = '/oblitus';
        return 'Going dark...';
      }
    },
    cursor: {
      desc: 'Change cursor shape. Usage: cursor <shape> (default | glow-circle | tri-force)',
      exec: (shape) => {
        if (!shape) {
          console.log('%cCurrent cursor shape: ' + (localStorage.getItem('nova-cursor') || 'default'), 'color: rgba(255,255,255,0.8);');
          return 'Use: cursor [default|glow-circle|tri-force]';
        }
        if (window.CursorJS && window.CursorJS.loadCursor) {
          window.CursorJS.loadCursor(shape);
          return `Cursor updated to: ${shape}`;
        }
        return 'CursorJS API not loaded yet.';
      }
    },
    follower: {
      desc: 'Change follower. Usage: follower <type> (cat | calico | dog | eevee | ghost | fox | none)',
      exec: (type) => {
        if (!type) {
          console.log('%cCurrent follower: ' + (localStorage.getItem('nova-follower') || 'cat'), 'color: rgba(255,255,255,0.8);');
          return 'Use: follower [cat|calico|dog|eevee|ghost|fox|none]';
        }
        if (window.CursorJS && window.CursorJS.loadFollower) {
          window.CursorJS.loadFollower(type);
          return `Follower updated to: ${type}`;
        }
        return 'CursorJS API not loaded yet.';
      }
    },
    clear: {
      desc: 'Clear console screen',
      exec: () => {
        console.clear();
        return 'Console cleared.';
      }
    }
  };

  const NovaConsole = {
    exec: function(commandLine) {
      if (!commandLine) return 'No command entered.';
      const parts = commandLine.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      if (commands[cmd]) {
        return commands[cmd].exec(arg);
      } else {
        console.warn(`Unknown command: "${cmd}". Type "NovaConsole.exec('help')" for help.`);
        return `Unknown command: ${cmd}`;
      }
    }
  };

  // Expose to window
  if (typeof window !== 'undefined') {
    window.NovaConsole = NovaConsole;
  }
})();
