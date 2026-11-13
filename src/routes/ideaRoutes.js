import { Router } from "express";
import { createIdea, getMyIdeas, getIdea, deleteIdea, compareIdeas, addFeedback } from "../controllers/ideaController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { ROLES } from "../config/roles.js";

const router = Router();
router.use(protect);

router.route("/").post(createIdea).get(getMyIdeas);
router.get("/compare", compareIdeas); // must stay above "/:id"
router.route("/:id").get(getIdea).delete(deleteIdea);
router.post(
  "/:id/feedback",
  authorize(ROLES.MENTOR, ROLES.EXPERT, ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.MODERATOR),
  addFeedback
);

export default router;
