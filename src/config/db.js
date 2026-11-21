import mongoose from "mongoose";

const connectDB = async (retries = 5, delayMs = 3000) => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/soch2startup";

  if (process.env.NODE_ENV === "production" && !process.env.MONGO_URI) {
    console.warn(
      "\x1b[33m[MONGO WARNING]\x1b[0m MONGO_URI is not set in Render environment variables.\n" +
      "Attempting localhost fallback (which will fail on Render cloud instances).\n" +
      "Please configure MONGO_URI in your Render Dashboard -> Environment Variables with your MongoDB Atlas connection string.\x1b[0m"
    );
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      });
      console.log("MongoDB connected");
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt < retries) {
        console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error(
          "\x1b[31m[ACTION REQUIRED]\x1b[0m MongoDB connection could not be established.\n" +
          "1. Verify MONGO_URI in your Render Dashboard -> Environment Variables.\n" +
          "2. In MongoDB Atlas -> Network Access, ensure IP 0.0.0.0/0 (Allow Access from Anywhere) is active.\n" +
          "3. Verify your database username and password in the connection string.\x1b[0m"
        );
        process.exit(1);
      }
    }
  }
};

export default connectDB;
