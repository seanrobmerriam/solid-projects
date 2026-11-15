# GitHub Actions → Dokploy Cloud

This application uses Bun 1.4.3 for tooling and the production server. Dokploy builds it with Railpack; no Dockerfile, Compose stack, registry, or deployment SSH key is needed.

## Release flow

Pull requests and pushes to `main` run frozen installation, TypeScript checks, deployment-client tests, a production build, built-server health/SSR/route-protection checks, and the Chromium browser suite against the built production server. Browser reports and failure traces are retained for seven days. Local browser tests use the development server unless `CI=true` is set; build first when using that flag.

Once enabled, a successful `main` run advances `production` to the tested commit with a normal fast-forward push, calls Dokploy, waits for that run's uniquely named deployment to finish, and checks the public `/api/health` endpoint. Dokploy builds `production`, never a moving, potentially untested `main`. Deployment jobs are serialized; superseded main runs are skipped. Do not push to `production` yourself or enable another deployment trigger.

The health route checks the application process, not Neon connectivity or every authenticated feature. The workflow verifies Dokploy completion and public availability; it does not independently attest the running container's commit. Dokploy remains responsible for rollout and rollback.

## Configure Dokploy Cloud

Open [Dokploy Cloud](https://app.dokploy.com/dashboard), project **SolidProjects**, application **solidprojects-frontend-sb6wn2**.

1. Select your dedicated deployment server and connect the GitHub repository `seanrobmerriam/solid-projects`.
2. Set the source branch to `production` and **disable Auto Deploy**. If the branch selector requires an existing branch, run CI with deployment disabled first, then create `production` from the checked main commit in GitHub. Do not deploy before configuration is complete.
3. Set the build path to `/` (the directory containing `package.json` and `railpack.json`). Select **Railpack**, version **0.43.0**. Clear build/start overrides so the repository configuration applies.
4. Set the application domain to **solid.typesayfe.com**, enable HTTPS, and route to container port **3000**. No public host-port mapping is needed.
5. Set production environment values in Dokploy:

   ```dotenv
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=3000
   APP_ORIGIN=https://solid.typesayfe.com
   NEON_AUTH_COOKIE_SECRET=<random-secret-at-least-32-characters>
   # Also inject the production branch values from neon env pull:
   # DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL,
   # AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION,
   # NEON_REALTIME_URL, NEON_REALTIME_SECRET,
   # NEON_BRANCH_ID, NEON_FUNCTION_HOST_SUFFIX
   ```

   Configure GitHub OAuth in Neon Auth, with `https://solid.typesayfe.com` as a trusted application origin. Never commit real values. Production secrets belong in Dokploy, not build arguments or workflow YAML. See [NEON_MIGRATION.md](NEON_MIGRATION.md) for the complete environment contract.

6. The migrated application uses Neon for identity, metadata, and attachments; it does not require a local auth volume. Preserve any old `.data` backup before the first rollout. Existing local accounts/sessions are not automatically imported; registration or configured GitHub sign-in creates a managed account.
7. Generate a Dokploy API key in your profile settings. Give it the narrowest permissions available for reading this application/deployments and deploying it. The API uses `x-api-key`; Actions calls Dokploy Cloud, which manages your dedicated server.

`solidprojects-frontend-sb6wn2` may be the generated `appName`, not the API's `applicationId`. The client first tries it as an ID; on HTTP 404 it resolves an exact app-name match from `project.all`. Using the actual API ID is preferable and avoids requiring project-list access. If Cloud returns a different not-found status, set the actual ID explicitly.

## Configure GitHub

In [repository Actions settings](https://github.com/seanrobmerriam/solid-projects/settings/actions), allow workflows and permit the deployment job's `contents: write` permission so it can advance `production`.

Create a GitHub environment named **production**. Limit deployments to `main`. In its secrets, add:

| Secret | Value |
| --- | --- |
| `DOKPLOY_API_KEY` | Your Dokploy API key |

The workflow already defaults to your Dokploy Cloud address, app name and public URL. These optional environment variables override those defaults:

| Variable | Value |
| --- | --- |
| `DOKPLOY_URL` | `https://app.dokploy.com` |
| `DOKPLOY_APPLICATION_ID` | `ZnW2adA8fTgCAMGlXs0D2` (verified API application ID) |
| `APP_URL` | `https://solid.typesayfe.com` |

Then add a **repository-level** Actions variable `DEPLOY_ENABLED` with value `true`. Keep it absent or `false` until setup is complete. It must be repository-level because the deployment job's condition is evaluated before environment variables are available.

Protect `main`: require PRs and the **Validate** check, with branches up to date before merge. Limit direct writes to `production` to the deployment workflow; account for its `GITHUB_TOKEN` when configuring rules. Do not require a separate PR for Actions' fast-forward production push. PR validation gets read-only permissions and no production credentials.

If using the CLI, authenticate yourself first with `gh auth login`. The key can then be entered at a hidden prompt rather than placed in a shell command:

```sh
gh secret set DOKPLOY_API_KEY --env production --repo seanrobmerriam/solid-projects
```

This stores the key in GitHub; you do not need to share it in chat or put it on this computer. You can also paste it directly into GitHub's environment-secret form.

## First release and recovery

To inspect Dokploy without deploying, run **CI and deploy** manually on `main` with **Inspect Dokploy configuration without deploying** selected. This prints selected non-secret settings and checks whether required environment keys exist. It never prints their values and skips deployment even if `DEPLOY_ENABLED` is true.

After the checked `production` branch exists, the separate **Configure the production source branch and pinned Railpack without deploying** option sets the source branch, disables Auto Deploy, and pins Railpack to 0.43.0. It verifies the application belongs to this repository and has no unfinished deployment. It preserves domain, environment values, and storage, and does not restart the app. Manual inspection/configuration skips the validation and deployment jobs; ordinary main pushes still run full validation.

Push the workflow, let validation pass, finish the above configuration, then run **CI and deploy** manually on `main`, or merge a checked PR. Watch **Deploy production** and the corresponding Dokploy deployment. A successful API request alone does not complete the job.

If a run times out or is manually cancelled, inspect Dokploy and wait for or cancel any pending deployment **before rerunning or promoting another commit**. The GitHub timeout cannot cancel a server-side build. Do not manually deploy or change the source branch during an Actions deployment. A non-fast-forward promotion intentionally fails; investigate rather than force-pushing.

For rollback, disable `DEPLOY_ENABLED`, use Dokploy's retained-image rollback, and verify `/api/health` plus sign-in. Fix/revert on `main` before re-enabling automated releases. Keep retained images in Dokploy. A failed public smoke check reports failure; it does not automatically roll back a working service.

## Neon backend and release hold

Neon Auth, Postgres, Object Storage, Realtime and a protected summary Function are wired in this branch. CI uses disposable clones of the empty `ci-template` branch and the project-scoped `NEON_API_KEY` repository secret. Forks without credentials still run unit, build, smoke and public-route checks.

Production app releases remain disabled. Before enabling `DEPLOY_ENABLED`, merge the verified code, apply migrations and `neon deploy` to production, synchronize its runtime environment to Dokploy, and verify the GitHub OAuth provider. Future changes to migrations or Function source must be applied to Neon before the corresponding app release. See [NEON_MIGRATION.md](NEON_MIGRATION.md).

References: [Dokploy API deployment](https://docs.dokploy.com/docs/core/auto-deploy), [deployment status API](https://docs.dokploy.com/docs/api/deployment), [Railpack configuration](https://railpack.com/config/file/), [Bun version selection](https://railpack.com/languages/bun/).
