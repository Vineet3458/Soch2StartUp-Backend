import { Router } from "express";
import { getStats, getUsers, updateRole, toggleActive, getAllIdeas, deleteIdeaAsAdmin } from "../controllers/adminController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { ROLES } from "../config/roles.js";

const router = Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.SUPERADMIN));

router.get("/stats", getStats);
router.get("/users", getUsers);
router.patch("/users/:id/toggle", toggleActive);
router.patch("/users/:id/role", authorize(ROLES.SUPERADMIN), updateRole);
router.get("/ideas", getAllIdeas);
router.delete("/ideas/:id", deleteIdeaAsAdmin);

export default router;
