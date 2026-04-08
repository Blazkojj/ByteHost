const { spawn } = require("child_process");

function getShellInvocation(command) {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-Command", command]
    };
  }

  return {
    command: "/bin/bash",
    args: ["-lc", command]
  };
}

function spawnBuffered(command, args = [], options = {}) {
  const maxOutput = options.maxOutput || 150000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      shell: options.shell || false
    });

    let stdout = "";
    let stderr = "";

    const append = (source, chunk) => {
      const nextValue = source + chunk.toString("utf8");
      return nextValue.length > maxOutput ? nextValue.slice(-maxOutput) : nextValue;
    };

    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code, stdout, stderr });
        return;
      }

      const error = new Error(
        stderr.trim() || stdout.trim() || `Polecenie zakończyło się kodem ${code}.`
      );
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function runShellCommand(command, options = {}) {
  const shell = getShellInvocation(command);
  return spawnBuffered(shell.command, shell.args, options);
}

module.exports = {
  getShellInvocation,
  spawnBuffered,
  runShellCommand
};
