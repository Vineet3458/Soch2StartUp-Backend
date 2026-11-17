export const ROLES = {
  ENTREPRENEUR: "entrepreneur",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
  MENTOR: "mentor",
  EXPERT: "industry_expert",
  MODERATOR: "moderator",
};

// Roles a person may choose themselves while registering
export const SELF_REGISTER_ROLES = [ROLES.ENTREPRENEUR, ROLES.MENTOR, ROLES.EXPERT];

// Roles that need an admin to verify them before they can act
export const VERIFY_ROLES = [ROLES.MENTOR, ROLES.EXPERT];

export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPERADMIN];
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.MENTOR, ROLES.EXPERT, ROLES.MODERATOR];

export const IDEA_STATUS = ["draft", "submitted", "under_review", "approved", "rejected", "changes_requested", "archived"];
