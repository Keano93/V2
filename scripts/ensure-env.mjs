// Create .env from .env.example on first run so `npm run dev` works out of the box.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example. Add your ANTHROPIC_API_KEY to it to enable AI detection.");
}
