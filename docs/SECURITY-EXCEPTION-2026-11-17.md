# Tillfälligt undantag för byggverktyg

Godkänt av produktägaren 2026-11-17 efter förklaring och uttrycklig begäran att
publicera. Upphör 2026-11-24 kl. 00:00 UTC. Gäller endast
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
i utvecklingsberoendet picomatch och dess beroendekedjor.

Picomatch kan överbelastas av konstruerade globmönster. Bygg- och testverktygen
använder projektstyrda mönster. Beroendet ingår inte i den publicerade klienten;
produktionsberoenden kontrolleras separat. Ingen rättad version fanns vid beslutet.
Detta begränsar exponeringen men lagar inte sårbarheten.

`node scripts/audit-release.mjs` ersätter auditkommandot i CI. Det läser hela
auditrapporten och en separat produktionsrapport. Alla andra high/critical-fynd
blockerar fortsatt; moderate-fynd redovisas enligt tidigare tröskel. Undantaget
kräver att varje berört paket är markerat dev i låsfilen. Produktionsfynd,
okänd rapport, trasig beroendekedja, auditfel och utgånget undantag stoppar bygget.
Inga beroendeversioner har ändrats. Inga övriga CI-steg får hoppas över.

Åtgärd efter upstream-rättning: uppdatera låsfilen, ta bort detta undantag och
återställ ordinarie `npm audit --audit-level=high` efter verifiering.
