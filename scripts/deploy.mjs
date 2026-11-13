function httpsOrigin(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be an HTTPS origin without credentials or a path`);
  }
  return url.origin;
}

export async function deploy(config, {
  fetcher = fetch, sleep = milliseconds => Bun.sleep(milliseconds), maxAttempts = 120
} = {}) {
  for (const key of ["baseUrl", "applicationId", "apiKey", "appUrl", "sha", "runId"]) {
    if (!config[key]) throw new Error(`Missing deployment configuration: ${key}`);
  }
  if (!/^[a-f0-9]{40}$/.test(config.sha)) throw new Error("Expected a full commit SHA");
  const base = httpsOrigin(config.baseUrl, "DOKPLOY_URL");
  const app = httpsOrigin(config.appUrl, "APP_URL");
  async function api(method, endpoint, data, allowNotFound = false) {
    const url = new URL(`/api/${endpoint}`, base);
    if (method === "GET") url.search = new URLSearchParams(data).toString();
    const response = await fetcher(url, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { "x-api-key": config.apiKey, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(data) } : {})
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new Error(`Dokploy ${endpoint} failed (HTTP ${response.status})`);
    return response.json();
  }
  let applicationId = config.applicationId;
  let application = await api("GET", "application.one", { applicationId }, true);
  if (!application) {
    const projects = await api("GET", "project.all", {});
    const matches = new Set();
    const projectIds = new Set();
    function visit(value) {
      if (!value || typeof value !== "object") return;
      if (value.appName === config.applicationId && typeof value.applicationId === "string") matches.add(value.applicationId);
      if (typeof value.projectId === "string") projectIds.add(value.projectId);
      for (const child of Object.values(value)) visit(child);
    }
    visit(projects);
    if (matches.size === 0) {
      // The summary endpoint omits appName on current Dokploy versions.
      for (const projectId of projectIds) visit(await api("GET", "project.one", { projectId }));
    }
    if (matches.size !== 1) throw new Error("Could not uniquely resolve the Dokploy app name; use its API applicationId");
    applicationId = [...matches][0];
    application = await api("GET", "application.one", { applicationId });
  }
  if (config.inspect) {
    const envNames = new Set((application.env ?? "").split("\n").map(line => line.split("=", 1)[0].trim()));
    console.log(JSON.stringify({
      applicationId, appName: application.appName, branch: application.branch,
      owner: application.owner, repository: application.repository, buildPath: application.buildPath,
      autoDeploy: application.autoDeploy, buildType: application.buildType, railpackVersion: application.railpackVersion,
      domains: application.domains?.map(domain => ({ host: domain.host, port: domain.port, https: domain.https })),
      mounts: application.mounts?.map(mount => ({ type: mount.type, mountPath: mount.mountPath })),
      configured: Object.fromEntries(["SESSION_SECRET", "OAUTH_ORIGIN", "DISCORD_ID", "DISCORD_SECRET"].map(name => [name, envNames.has(name)]))
    }, null, 2));
    return;
  }
  if (config.configure) {
    if (!config.repository || `${application.owner}/${application.repository}` !== config.repository) {
      throw new Error("Dokploy repository does not match this workflow repository");
    }
    const deployments = await api("GET", "deployment.all", { applicationId });
    if (!Array.isArray(deployments) || deployments.some(deployment => !["done", "error", "cancelled"].includes(deployment.status))) {
      throw new Error("Cannot configure Dokploy while a deployment is unfinished");
    }
    await api("POST", "application.update", {
      applicationId, branch: "production", autoDeploy: false, triggerType: "push",
      buildType: "railpack", railpackVersion: "0.43.0"
    });
    const saved = await api("GET", "application.one", { applicationId });
    if (saved.branch !== "production" || saved.autoDeploy !== false || saved.buildType !== "railpack" || saved.railpackVersion !== "0.43.0") {
      throw new Error("Dokploy did not retain the requested configuration");
    }
    return;
  }
  if (application.branch !== "production" || application.autoDeploy !== false || application.buildType !== "railpack") {
    throw new Error("Dokploy must use the production branch, Railpack, and Auto Deploy disabled");
  }
  if (config.preflight) {
    const deployments = await api("GET", "deployment.all", { applicationId });
    if (!Array.isArray(deployments) || deployments.some(deployment => !["done", "error", "cancelled"].includes(deployment.status))) {
      throw new Error("Dokploy has an unfinished deployment; resolve it before promoting another commit");
    }
    return;
  }
  const title = `GitHub ${config.runId}: ${config.sha}`;
  await api("POST", "application.deploy", { applicationId, title });
  let done = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const deployments = await api("GET", "deployment.all", { applicationId });
    if (!Array.isArray(deployments)) throw new Error("Invalid Dokploy deployment list");
    const current = deployments.find(deployment => deployment.title === title);
    if (current?.status === "done") { done = true; break; }
    if (current && current.status !== "running") {
      throw new Error("Dokploy deployment failed or returned an unknown status; inspect its deployment logs");
    }
    await sleep(10_000);
  }
  if (!done) throw new Error("Timed out waiting for Dokploy; inspect the server before retrying");
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetcher(`${app}/api/health`, {
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000)
      });
      if (response.ok && (await response.json()).status === "ok") return;
    } catch {}
    await sleep(2000);
  }
  throw new Error("Deployment completed but public health checks failed");
}

if (import.meta.main) {
  try {
    await deploy({
      baseUrl: process.env.DOKPLOY_URL, applicationId: process.env.DOKPLOY_APPLICATION_ID,
      apiKey: process.env.DOKPLOY_API_KEY, appUrl: process.env.APP_URL,
      sha: process.env.GITHUB_SHA,
      preflight: process.argv.includes("--preflight"),
      inspect: process.argv.includes("--inspect"),
      configure: process.argv.includes("--configure"), repository: process.env.GITHUB_REPOSITORY,
      runId: `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`
    });
    console.log(process.argv.includes("--configure") ? "Dokploy production branch and Railpack configured; no deployment requested" :
      process.argv.includes("--inspect") ? "Dokploy inspection completed; no deployment requested" :
      process.argv.includes("--preflight") ? "Dokploy configuration and queue checks passed" :
      "Dokploy deployment completed and public health check passed");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  }
}
