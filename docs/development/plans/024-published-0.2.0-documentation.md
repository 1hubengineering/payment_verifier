# Published 0.2.0 documentation

Record publication separately from workspace and deployment changes. Promote
the npm 0.2.0 guides and declaration index while retaining archived versions.

- [x] Compare npm ownership, checksums, and installed behavior with the
      prepared release manifest. Check GitHub Releases and the hosted guides.
- [x] Document the released API from its npm tarballs and pin source links to
      the verified release commit. Keep workspace preview behavior labeled.
- [x] Run `pnpm verify`, smoke-test the built guides, and run the quickstart
      against the published npm package.

The Pages workflow deploys from main. The GitHub release entry is separate
from the npm versions and the feature-branch push.
