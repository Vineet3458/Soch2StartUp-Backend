import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import ideaRoutes from "./src/routes/ideaRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import { notFound, errorHandler } from "./src/middleware/errorMiddleware.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/ideas", ideaRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB().then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
