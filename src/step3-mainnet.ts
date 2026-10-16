import { readMainnet } from "./mainnet-read.js";

// Step 3: read mainnet with an API key you already have.
const apiKey = process.env.BLOCKVECTRA_API_KEY?.trim();
if (!apiKey) {
  throw new Error(
    "Set BLOCKVECTRA_API_KEY to an existing API key (create one in the console), " +
      "or run `npm run walkthrough` to get a key and use it for the mainnet read in one process.",
  );
}

await readMainnet(apiKey);
