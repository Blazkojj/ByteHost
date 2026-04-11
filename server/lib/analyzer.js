const fs = require("fs/promises");
const path = require("path");

const { buildGameStartCommand, getGamePreset, isGamePresetService } = require("./gamePresets");
const { normalizeRelativePath } = require("./utils");

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode"
]);

const JS_ENTRY_CANDIDATES = [
  "dist/index.js",
  "index.js",
  "main.js",
  "bot.js",
  "app.js",
  "src/index.js",
  "src/main.js"
];

const TS_ENTRY_CANDIDATES = [
  "dist/index.js",
  "index.ts",
  "main.ts",
  "bot.ts",
  "app.ts",
  "src/index.ts",
  "src/main.ts"
];

const PY_ENTRY_CANDIDATES = ["main.py", "bot.py", "app.py", "index.py", "src/main.py"];
const FIVEM_ENTRY_CANDIDATES = ["run.sh"];

const MINECRAFT_JAR_PATTERNS = [
  /^server\.jar$/i,
  /^paper.*\.jar$/i,
  /^purpur.*\.jar$/i,
  /^spigot.*\.jar$/i,
  /^craftbukkit.*\.jar$/i,
  /^fabric.*\.jar$/i,
  /^forge.*\.jar$/i,
  /^neoforge.*\.jar$/i,
  /^minecraft.*\.jar$/i,
  /^velocity.*\.jar$/i,
  /^waterfall.*\.jar$/i,
  /^bungeecord.*\.jar$/i
];

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function readJsonIfExists(targetPath) {
  if (!(await fileExists(targetPath))) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch (_error) {
    return null;
  }
}

async function collectFiles(rootDirectory, depth = 0, bucket = []) {
  if (depth > 4) {
    return bucket;
  }

  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDirectory, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await collectFiles(fullPath, depth + 1, bucket);
      continue;
    }

    bucket.push(fullPath);
  }

  return bucket;
}

async function findFirstExisting(rootDirectory, candidates) {
  for (const candidate of candidates) {
    const candidatePath = path.join(rootDirectory, candidate);
    if (await fileExists(candidatePath)) {
      return normalizeRelativePath(candidate);
    }
  }

  return null;
}

async function findByBasename(rootDirectory, basenames, collectedFiles) {
  const normalized = basenames.map((entry) => entry.toLowerCase());
  const matchedFile = collectedFiles.find((filePath) =>
    normalized.includes(path.basename(filePath).toLowerCase())
  );

  if (!matchedFile) {
    return null;
  }

  return normalizeRelativePath(path.relative(rootDirectory, matchedFile));
}

function collectDependencyNames(packageJson) {
  const dependencies = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {})
  };

  return new Set(Object.keys(dependencies));
}

async function detectLanguage(projectPath, packageJson, collectedFiles) {
  const dependencyNames = collectDependencyNames(packageJson);

  if (packageJson) {
    const typescriptSignals =
      dependencyNames.has("typescript") ||
      dependencyNames.has("tsx") ||
      dependencyNames.has("ts-node") ||
      (await fileExists(path.join(projectPath, "tsconfig.json"))) ||
      collectedFiles.some((filePath) => filePath.endsWith(".ts"));

    return typescriptSignals ? "TypeScript" : "Node.js";
  }

  if (
    collectedFiles.some((filePath) => filePath.endsWith(".py")) ||
    (await fileExists(path.join(projectPath, "requirements.txt")))
  ) {
    return "Python";
  }

  if (collectedFiles.some((filePath) => filePath.endsWith(".ts"))) {
    return "TypeScript";
  }

  return "Node.js";
}

async function detectEntryFile(projectPath, language, packageJson, collectedFiles) {
  if (packageJson?.main) {
    const packageMain = normalizeRelativePath(packageJson.main);
    if (await fileExists(path.join(projectPath, packageMain))) {
      return packageMain;
    }
  }

  const directCandidates =
    language === "Python"
      ? PY_ENTRY_CANDIDATES
      : language === "TypeScript"
        ? TS_ENTRY_CANDIDATES
        : JS_ENTRY_CANDIDATES;

  const directMatch = await findFirstExisting(projectPath, directCandidates);
  if (directMatch) {
    return directMatch;
  }

  const fallbackNames =
    language === "Python"
      ? ["main.py", "bot.py", "app.py", "index.py"]
      : language === "TypeScript"
        ? ["index.ts", "main.ts", "bot.ts", "app.ts", "index.js", "main.js", "dist/index.js"]
        : ["index.js", "main.js", "bot.js", "app.js"];

  return findByBasename(projectPath, fallbackNames, collectedFiles);
}

function detectPackageManager(projectPath) {
  return Promise.all([
    fileExists(path.join(projectPath, "pnpm-lock.yaml")),
    fileExists(path.join(projectPath, "yarn.lock")),
    fileExists(path.join(projectPath, "package-lock.json"))
  ]).then(([hasPnpm, hasYarn]) => {
    if (hasPnpm) {
      return "pnpm";
    }

    if (hasYarn) {
      return "yarn";
    }

    return "npm";
  });
}

async function detectStartCommand(projectPath, language, entryFile, packageJson) {
  const dependencyNames = collectDependencyNames(packageJson);

  if (packageJson?.scripts?.start) {
    const packageManager = await detectPackageManager(projectPath);
    return packageManager === "npm" ? "npm start" : `${packageManager} start`;
  }

  if (language === "Python" && entryFile) {
    return `python3 "${entryFile}"`;
  }

  if (language === "TypeScript" && entryFile) {
    if (entryFile.endsWith(".js")) {
      return `node "${entryFile}"`;
    }

    if (dependencyNames.has("tsx")) {
      return `npx tsx "${entryFile}"`;
    }

    if (dependencyNames.has("ts-node")) {
      return `npx ts-node "${entryFile}"`;
    }
  }

  if (entryFile) {
    return `node "${entryFile}"`;
  }

  return null;
}

async function detectInstallCommand(projectPath, language, packageJson) {
  if (packageJson) {
    const packageManager = await detectPackageManager(projectPath);
    return {
      install_command: `${packageManager} install`,
      package_manager: packageManager
    };
  }

  if (language === "Python" && (await fileExists(path.join(projectPath, "requirements.txt")))) {
    return {
      install_command: "python3 -m pip install -r requirements.txt",
      package_manager: "pip"
    };
  }

  return {
    install_command: null,
    package_manager: null
  };
}

function buildMinecraftStartCommand(entryFile, ramLimitMb = 2048, serverType = "") {
  if (!entryFile) {
    return null;
  }

  const maxRam = Math.max(512, Number(ramLimitMb || 0) || 2048);
  const minRam = Math.max(256, Math.min(1024, maxRam));
  const proxyJar =
    /(velocity|waterfall|travertine|bungeecord)/i.test(path.basename(entryFile)) ||
    /^(velocity|waterfall|travertine)$/i.test(String(serverType || ""));
  return `java -Xms${minRam}M -Xmx${maxRam}M -jar "${entryFile}"${proxyJar ? "" : " nogui"}`;
}

function buildFiveMStartCommand(entryFile = "run.sh", configFile = "server.cfg") {
  if (!entryFile) {
    return null;
  }

  return `bash "${entryFile}" +exec "${configFile}"`;
}

function getMinecraftJarPriority(relativePath) {
  const baseName = path.basename(relativePath);
  const rootBonus = relativePath.includes("/") ? 0 : 20;
  const index = MINECRAFT_JAR_PATTERNS.findIndex((pattern) => pattern.test(baseName));
  const patternBonus = index === -1 ? 0 : MINECRAFT_JAR_PATTERNS.length - index;
  return rootBonus + patternBonus;
}

async function detectMinecraftEntryFile(projectPath, collectedFiles) {
  const jarFiles = collectedFiles
    .filter((filePath) => filePath.toLowerCase().endsWith(".jar"))
    .map((filePath) => normalizeRelativePath(path.relative(projectPath, filePath)));

  if (jarFiles.length === 0) {
    return null;
  }

  jarFiles.sort((left, right) => {
    const priorityDiff = getMinecraftJarPriority(right) - getMinecraftJarPriority(left);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.localeCompare(right);
  });

  return jarFiles[0];
}

async function analyzeMinecraftProject(projectPath, options, collectedFiles) {
  const detected_entry_file = await detectMinecraftEntryFile(projectPath, collectedFiles);
  const detected_start_command = buildMinecraftStartCommand(
    detected_entry_file,
    options.ramLimitMb
  );

  return {
    detected_language: "Java",
    detected_entry_file,
    detected_start_command,
    install_command: null,
    package_manager: "jar"
  };
}

async function analyzeFiveMProject(projectPath) {
  const detected_entry_file = await findFirstExisting(projectPath, FIVEM_ENTRY_CANDIDATES);

  return {
    detected_language: "FiveM",
    detected_entry_file: detected_entry_file || "run.sh",
    detected_start_command: buildFiveMStartCommand(detected_entry_file || "run.sh"),
    install_command: null,
    package_manager: "fxserver"
  };
}

async function analyzeGamePresetProject(projectPath, serviceType) {
  const preset = getGamePreset(serviceType);
  const detected_entry_file =
    (await findFirstExisting(projectPath, [preset.entryFile, "start.sh", "run.sh"])) ||
    preset.entryFile;

  return {
    detected_language: preset.language,
    detected_entry_file,
    detected_start_command: buildGameStartCommand(serviceType, detected_entry_file),
    install_command: preset.installCommand,
    package_manager: preset.packageManager
  };
}

async function analyzeProject(projectPath, options = {}) {
  const collectedFiles = await collectFiles(projectPath);
  const serviceType = options.serviceType || "discord_bot";

  if (serviceType === "minecraft_server") {
    return analyzeMinecraftProject(projectPath, options, collectedFiles);
  }

  if (serviceType === "fivem_server") {
    return analyzeFiveMProject(projectPath);
  }

  if (isGamePresetService(serviceType)) {
    return analyzeGamePresetProject(projectPath, serviceType);
  }

  const packageJson = await readJsonIfExists(path.join(projectPath, "package.json"));
  const detected_language = await detectLanguage(projectPath, packageJson, collectedFiles);
  const detected_entry_file = await detectEntryFile(
    projectPath,
    detected_language,
    packageJson,
    collectedFiles
  );
  const detected_start_command = await detectStartCommand(
    projectPath,
    detected_language,
    detected_entry_file,
    packageJson
  );
  const installInfo = await detectInstallCommand(projectPath, detected_language, packageJson);

  return {
    detected_language,
    detected_entry_file,
    detected_start_command,
    install_command: installInfo.install_command,
    package_manager: installInfo.package_manager
  };
}

module.exports = {
  analyzeProject,
  buildMinecraftStartCommand,
  buildFiveMStartCommand
};
