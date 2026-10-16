# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub Issues.

Use GitHub's **Report a vulnerability** action when it is available for this repository. This uses GitHub Private Vulnerability Reporting and keeps security details private while the report is triaged.

If the private reporting action is not available, do not publish sensitive details in public issues, discussions, or pull requests. Contact the repository maintainer through a private channel and request a secure reporting path before sharing vulnerability details.

Do not include in public discussions:

- passwords, tokens, API keys or secrets
- private user data
- production data
- exploit details that would materially enable abuse

A useful private report should contain only the information needed to reproduce and assess the issue:

- affected component or area
- observed behavior
- expected behavior
- minimal reproduction steps
- impact assessment

Do not attach real user data or secrets when synthetic data is sufficient.

## Scope

Security reports may include issues affecting:

- authentication and authorization
- tenant isolation and privacy boundaries
- data exposure
- cryptographic handling
- dependency or supply-chain risks
- deployment and configuration security

The technical security model and application security invariants are documented separately in `docs/SECURITY.md`.

## Supported versions

The project does not currently publish production releases. Until the first stable release, security fixes are evaluated against the current `main` branch.

After releases are introduced, supported versions will be documented here.

## Response process

The maintainers will:

1. acknowledge receipt when possible;
2. validate and classify the reported issue;
3. investigate impact and affected components;
4. prepare a fix or mitigation where appropriate;
5. coordinate disclosure timing with the reporter when practical.

Reports are handled on a need-to-know basis. Security details should remain private until a fix or mitigation is available and coordinated disclosure has been agreed where practical.

## Coordinated disclosure

Please allow reasonable time for investigation and remediation before publicly disclosing a vulnerability.

The project aims to balance transparency with protecting users and deployments from active exploitation.
