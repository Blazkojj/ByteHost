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
  const timeoutMs = options.timeoutMs || 0;

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
    let finished = false;
    let timeoutId = null;

    const append = (source, chunk) => {
      const nextValue = source + chunk.toString("utf8");
      return nextValue.length > maxOutput ? nextValue.slice(-maxOutput) : nextValue;
    };

    const settle = (handler) => (value) => {
      if (finished) {
        return;
      }

      finished = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      handler(value);
    };

    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        const error = new Error(`Polecenie przekroczylo limit czasu (${timeoutMs} ms).`);
        error.code = "ETIMEDOUT";
        error.stdout = stdout;
        error.stderr = stderr;
        settle(reject)(error);
      }, timeoutMs);
    }

    child.on("error", settle(reject));

    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        settle(resolve)({ code, stdout, stderr });
        return;
      }

      const error = new Error(
        stderr.trim() || stdout.trim() || `Polecenie zakonczylo sie kodem ${code}.`
      );
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      settle(reject)(error);
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
