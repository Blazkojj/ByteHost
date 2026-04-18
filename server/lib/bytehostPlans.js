const MB = 1024;

const SERVICE_GROUPS = {
  bot: {
    id: "bot",
    label: "Bot Discord",
    serviceType: "discord_bot",
    aliases: ["bot", "discord", "discord-bot", "discord_bot", "dc"]
  },
  minecraft: {
    id: "minecraft",
    label: "Minecraft",
    serviceType: "minecraft_server",
    aliases: ["minecraft", "mc", "minecraft_server"]
  },
  cs2: {
    id: "cs2",
    label: "CS2",
    serviceType: "cs2",
    aliases: ["cs2", "counter-strike-2", "counterstrike2"]
  },
  csgo: {
    id: "csgo",
    label: "CS:GO",
    serviceType: "csgo",
    aliases: ["csgo", "cs-go", "cs:go", "counter-strike-go"]
  },
  fivem: {
    id: "fivem",
    label: "FiveM",
    serviceType: "fivem_server",
    aliases: ["fivem", "five-m", "fivem_server"]
  },
  "project-zomboid": {
    id: "project-zomboid",
    label: "Project Zomboid",
    serviceType: "project_zomboid",
    aliases: ["project-zomboid", "project_zomboid", "pz", "zomboid"]
  },
  terraria: {
    id: "terraria",
    label: "Terraria",
    serviceType: "terraria",
    aliases: ["terraria"]
  },
  unturned: {
    id: "unturned",
    label: "Unturned",
    serviceType: "unturned",
    aliases: ["unturned"]
  }
};

const PLAN_GROUPS = {
  bot: {
    micro: { label: "Micro", ramMb: 512, cpuPercent: 50, storageMb: 1 * MB, serviceSlots: 1 },
    small: { label: "Small", ramMb: 1536, cpuPercent: 75, storageMb: 2 * MB, serviceSlots: 2 },
    medium: { label: "Medium", ramMb: 3 * MB, cpuPercent: 100, storageMb: 4 * MB, serviceSlots: 4 },
    pro: { label: "Pro", ramMb: 6 * MB, cpuPercent: 150, storageMb: 8 * MB, serviceSlots: 8 }
  },
  minecraft: {
    basic: { label: "Basic", ramMb: 1536, cpuPercent: 75, storageMb: 5 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 5 * MB, cpuPercent: 150, storageMb: 20 * MB, serviceSlots: 1 },
    ultra: { label: "Ultra", ramMb: 10 * MB, cpuPercent: 200, storageMb: 40 * MB, serviceSlots: 1 }
  },
  cs2: {
    basic: { label: "Basic", ramMb: 1536, cpuPercent: 75, storageMb: 5 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 5 * MB, cpuPercent: 150, storageMb: 20 * MB, serviceSlots: 1 },
    ultra: { label: "Ultra", ramMb: 8 * MB, cpuPercent: 200, storageMb: 30 * MB, serviceSlots: 1 }
  },
  csgo: {
    basic: { label: "Basic", ramMb: 1536, cpuPercent: 75, storageMb: 5 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 5 * MB, cpuPercent: 150, storageMb: 20 * MB, serviceSlots: 1 },
    ultra: { label: "Ultra", ramMb: 8 * MB, cpuPercent: 200, storageMb: 30 * MB, serviceSlots: 1 }
  },
  fivem: {
    basic: { label: "Basic", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 5 * MB, cpuPercent: 150, storageMb: 20 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 7 * MB, cpuPercent: 200, storageMb: 30 * MB, serviceSlots: 1 },
    ultra: { label: "Ultra", ramMb: 10 * MB, cpuPercent: 250, storageMb: 50 * MB, serviceSlots: 1 }
  },
  "project-zomboid": {
    basic: { label: "Basic", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 4 * MB, cpuPercent: 125, storageMb: 15 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 6 * MB, cpuPercent: 175, storageMb: 25 * MB, serviceSlots: 1 }
  },
  terraria: {
    basic: { label: "Basic", ramMb: 1 * MB, cpuPercent: 50, storageMb: 2 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 2 * MB, cpuPercent: 75, storageMb: 4 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 3 * MB, cpuPercent: 100, storageMb: 6 * MB, serviceSlots: 1 }
  },
  unturned: {
    basic: { label: "Basic", ramMb: 2 * MB, cpuPercent: 75, storageMb: 5 * MB, serviceSlots: 1 },
    standard: { label: "Standard", ramMb: 3 * MB, cpuPercent: 100, storageMb: 10 * MB, serviceSlots: 1 },
    pro: { label: "Pro", ramMb: 5 * MB, cpuPercent: 150, storageMb: 20 * MB, serviceSlots: 1 },
    ultra: { label: "Ultra", ramMb: 8 * MB, cpuPercent: 200, storageMb: 30 * MB, serviceSlots: 1 }
  }
};

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function resolveService(value) {
  const normalized = normalizeKey(value);
  return Object.values(SERVICE_GROUPS).find((service) =>
    service.aliases.some((alias) => normalizeKey(alias) === normalized) ||
    normalizeKey(service.id) === normalized ||
    normalizeKey(service.serviceType) === normalized
  );
}

function resolvePlan(serviceOrValue, planValue) {
  const service = typeof serviceOrValue === "string" ? resolveService(serviceOrValue) : serviceOrValue;
  if (!service) {
    return null;
  }

  const planKey = normalizeKey(planValue);
  const plan = PLAN_GROUPS[service.id]?.[planKey];
  if (!plan) {
    return null;
  }

  return {
    id: planKey,
    ...plan
  };
}

function resolveProvisionPlan(serviceValue, planValue) {
  const service = resolveService(serviceValue);
  const plan = resolvePlan(service, planValue);

  if (!service || !plan) {
    return null;
  }

  return {
    serviceId: service.id,
    serviceLabel: service.label,
    serviceType: service.serviceType,
    planId: plan.id,
    planLabel: plan.label,
    ramMb: plan.ramMb,
    cpuPercent: plan.cpuPercent,
    storageMb: plan.storageMb,
    serviceSlots: plan.serviceSlots
  };
}

function listValidPlans(serviceValue) {
  const service = resolveService(serviceValue);
  if (!service) {
    return [];
  }

  return Object.entries(PLAN_GROUPS[service.id] || {}).map(([id, plan]) => ({
    id,
    label: plan.label
  }));
}

function formatPlanSummary(plan) {
  return [
    `${plan.serviceLabel} - ${plan.planLabel}`,
    `RAM: ${plan.ramMb} MB`,
    `CPU: ${plan.cpuPercent}%`,
    `Dysk: ${plan.storageMb} MB`,
    `Sloty uslug: ${plan.serviceSlots}`
  ].join("\n");
}

module.exports = {
  PLAN_GROUPS,
  SERVICE_GROUPS,
  formatPlanSummary,
  listValidPlans,
  resolvePlan,
  resolveProvisionPlan,
  resolveService
};
