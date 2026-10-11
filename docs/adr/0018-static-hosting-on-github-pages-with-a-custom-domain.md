# 18. Static hosting on GitHub Pages with a custom domain

Status: accepted

## Context

The project is a static application and the brief asks for a build that deploys to GitHub Pages. The public address is https://fieldline.adrianturbinski.pl/, a custom domain on the repository's Pages site. GitHub Pages cannot set response headers.

## Decision

- The production build uses base href `/`. The build output contains a `CNAME` file with the host name, copied from `public/CNAME`.
- A `pages.yml` workflow runs only after the CI workflow has succeeded on a push to main, so a red commit is never published. The job also requires that the run came from a push to main in this repository, so a fork pull request cannot trigger a deploy. It builds with the same command as the CI workflow, uploads the build output as the Pages artifact and deploys it with the official actions. Nothing in the build depends on the repository name.
- Application state lives in the URL query string, so deep links work from the site root. The build also ships a `404.html` copy of `index.html` for unknown paths.
- No feature depends on response headers. Workers exchange transferable buffers and the code never uses SharedArrayBuffer, which would need cross-origin isolation.
- The CI workflow and the Pages workflow are checked with actionlint in a container. Creating the repository, enabling Pages and pointing the DNS record at it are manual steps for the repository owner.

## Alternatives

- A project page under `/fieldline/`. It needs a different base href for each hosting target and breaks absolute asset URLs when the site moves.
- A service worker that adds isolation headers. It adds complexity that no feature needs.

## Consequences

- The same artifact runs locally, in the end-to-end tests and on the public site.
- Local preview and tests serve the build at the root of a 127.0.0.1 port.
