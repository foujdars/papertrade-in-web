# Source and licensing

Papertrade is published under **GNU Affero General Public License version 3 only** (`AGPL-3.0-only`). The complete license is in [LICENSE](../LICENSE). Existing third-party components retain their own notices and licenses; see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Public application source: [foujdars/papertrade-in-web](https://github.com/foujdars/papertrade-in-web). Users may obtain the source, dependency lockfile, build scripts and installation documentation from the repository. The source for a deployed version must correspond to that deployed revision; use the repository's commit history and release identifier rather than assuming the latest main branch always matches a running deployment.

When operating a modified version over a network, preserve a prominent source/license link for users and make the Corresponding Source of that running version available without charge under the license. This includes application changes, interface definitions and scripts needed to build and install that version. Do not include credentials, private user data or API secrets in source archives; configuration examples should describe required settings.

When distributing application bundles, preserve the license, applicable notices and access to the corresponding source as required by the license. Do not represent third-party packages as Papertrade authorship. This licensing statement does not change ownership of third-party code, market data, user-created scripts, logos or trademarks.

The selected Pine runtime is [PineTS](https://github.com/LuxAlgo/PineTS), pinned to `pinets@0.11.1`, whose published package declares `AGPL-3.0-only` and includes the full license. The editor is [Monaco Editor](https://github.com/microsoft/monaco-editor), `monaco-editor@0.55.1`, MIT. Keep their installed notices when updating dependencies.

The authoritative terms are the [AGPL license text](../LICENSE), including section 13 for remote network interaction, and each dependency's own license. This page explains the repository's intended source provision; a repository link alone does not prove that every future deployment supplies matching Corresponding Source.
