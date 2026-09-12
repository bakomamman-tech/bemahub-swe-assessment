# Task 6 — Infrastructure

## Incident 1 — the invisible deploy

A fix is pushed, the build succeeds, deployment is green, but the change is not visible in the browser.

I would check the following in this order:

1. **Confirm I am looking at the expected environment and URL.**
   I would verify the hostname, environment, account/tenant if applicable, and deployment target. This rules out checking staging while the fix was deployed to production, or vice versa.

2. **Confirm the deployed version actually contains the expected commit.**
   I would compare the deployed commit SHA, image tag, build ID, or release identifier with the commit that contains the fix. A green deployment only proves that something deployed successfully; it does not prove the intended revision was deployed.

3. **Compare with the colleague for whom it works.**
   Since it works for one colleague, I would compare exact URL, environment, browser, account, feature flags, and permissions. This quickly identifies user-specific or environment-specific differences.

4. **Eliminate browser/cache issues.**
   I would hard-refresh, use a private/incognito window, and inspect the Network tab to see whether HTML/JS assets are being served from browser cache or a service worker. If the application uses a service worker, I would check whether an old worker is still controlling the page.

5. **Check CDN/reverse-proxy caching.**
   I would inspect response headers, asset hashes, and CDN cache status to see whether stale static assets or HTML are being served from an edge cache.

6. **Check feature flags and runtime configuration.**
   If the code is deployed but the feature is conditional, I would verify the relevant feature flag or configuration value for my user/environment.

7. **Inspect the actual browser request and response.**
   DevTools Network would confirm which bundle/version is loaded and whether the backend response contains the expected changed data.

This ordering starts with cheap, high-probability checks before moving into application internals.

## Incident 2 — 502 after deploy

The application works locally, but after deployment every API call returns `502 Bad Gateway`. The container is running, and the only change was a new feature that reads a configuration value.

The most likely cause is a missing, invalid, or differently named configuration value in the deployed environment.

I would check in this order:

1. **Check the application logs immediately after an API request.**
   A 502 from a reverse proxy usually means the upstream application failed to respond correctly, crashed, reset the connection, or never became ready. The application logs may directly show an exception such as a missing environment variable or failed configuration parse.

2. **Compare the new configuration between local and deployed environments.**
   I would verify that the expected environment variable or configuration key exists in the deployed service, has the correct name and case, and is available to the running process. This directly targets the only known change.

3. **Validate the configuration value itself.**
   I would check whether the value has the expected format and type, for example a valid URL, integer, JSON value, hostname, or credential reference. A value can exist but still cause startup or request-time failure if it cannot be parsed.

4. **Confirm the application is actually listening on the expected port and interface.**
   A container can be reported as running while the application inside it has failed or is listening on the wrong port or only on `localhost`. I would check startup logs, the configured `PORT`, and the process listener.

5. **Call the application directly from inside the container or service network.**
   If the upstream responds directly but the public endpoint still returns 502, the problem is more likely in the reverse proxy, ingress, load balancer, service discovery, or port mapping. If the direct request also fails, the fault is inside the application/container.

6. **Check readiness/health status and recent restarts.**
   A process may repeatedly crash and restart while the container platform continues to show the container as running. Restart counts and health-check failures would reveal this.

7. **Only then inspect proxy/ingress configuration.**
   Because the only change was application configuration, I would investigate proxy routing after ruling out the application/configuration path unless logs point there earlier.

The key distinction is that "container running" does not prove the application process inside it is healthy or reachable.

## Incident 3 — the vanishing change

The colleague modified a running container directly. That change existed only in the writable filesystem layer of that particular container.

When the next deployment created a new container from the original image, the manually installed tool and any related filesystem changes disappeared. Containers are intended to be disposable, so changes made interactively inside a running container are not a durable deployment method.

The change should instead have been made in the source-controlled build definition, such as the `Dockerfile`, package manifest, installation script, or configuration management used to build the image.

The correct process would be:

1. Add the required tool or dependency to the Dockerfile or other build source.
2. Commit the change to version control.
3. Build a new immutable image.
4. Test the image.
5. Deploy that image through the normal deployment process.

If the change was configuration rather than software, it should be supplied through the platform's configuration or secret mechanism rather than edited inside the running container.

This makes the change reproducible, reviewable, and persistent across redeployments and container replacements.