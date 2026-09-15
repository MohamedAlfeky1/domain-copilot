/**
 * ARCHITECTURE BOUNDARY LINTER (DEV-001)
 * Enforces Clean/Hexagonal Architecture boundaries:
 * Domain layer (src/core/domain) must NEVER import infrastructure, web frameworks, or AI SDKs.
 */

const fs = require("fs");
const path = require("path");

const FORBIDDEN_DOMAIN_IMPORTS = ["openai", "next", "pg", "react", "@electric-sql/pglite", "express"];

function checkDir(dir) {
  let violations = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations = violations.concat(checkDir(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      const content = fs.readFileSync(fullPath, "utf-8");
      for (const forbidden of FORBIDDEN_DOMAIN_IMPORTS) {
        const regex = new RegExp(`from\\s+['"]${forbidden}['"]`, "g");
        if (regex.test(content)) {
          violations.push(`VIOLATION: ${entry.name} imports forbidden dependency '${forbidden}'`);
        }
      }
    }
  }
  return violations;
}

const domainDir = path.join(__dirname, "../src/core/domain");
console.log("==================================================");
console.log("CLEAN ARCHITECTURE BOUNDARY LINT (DEV-001)");
console.log("Inspecting: src/core/domain");
console.log("==================================================");

if (!fs.existsSync(domainDir)) {
  console.log("Domain dir not found, skipping check.");
  process.exit(0);
}

const violations = checkDir(domainDir);
if (violations.length > 0) {
  violations.forEach((v) => console.error(v));
  console.error("Clean architecture boundary checks FAILED!");
  process.exit(1);
} else {
  console.log("✓ Zero forbidden external framework imports found in Domain layer.");
  console.log("✓ Domain purity check PASSED!");
  process.exit(0);
}
