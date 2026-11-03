// Command-line wrapper:  node server/scripts/make-xray-config.js "<link>" > config.json
import { buildXrayConfig } from '../xray-config.js';

try {
  console.log(JSON.stringify(buildXrayConfig(process.argv[2]).config, null, 2));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
