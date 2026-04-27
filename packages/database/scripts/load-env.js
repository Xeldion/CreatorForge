/**
 * Loads .env.local from the project root and makes it available to Prisma.
 * Usage: node scripts/load-env.js && prisma generate
 */
const fs = require("fs");
const path = require("path");

const rootEnv = path.resolve(__dirname, "..", "..", "..", ".env.local");

if (fs.existsSync(rootEnv)) {
  const content = fs.readFileSync(rootEnv, "utf-8");
  const lines = content.split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
    
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}
