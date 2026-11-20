import { collectLiveData } from "../services/liveDataService.js";
import { getConfig } from "../services/configService.js";
import { httpError, str } from "../utils.js";
import { audit } from "../services/logger.js";

// Preview only - no report is created. The idea form uses this to show the
// founder which live signals the council will see before they submit.
export const preview = async (req, res) => {
  const title = str(req.body.title, 120);
  const industry = str(req.body.industry, 40);
  const description = str(req.body.description, 4000);
  if (!title || !industry) throw httpError(400, "Add a title and an industry first");
  const engine = getConfig("engine");
  const result = await collectLiveData({ title, industry, description }, engine);
  audit(req.user, "live_data.preview", title, `${result.sources.length} sources via ${result.mode}`);
  res.json(result);
};
