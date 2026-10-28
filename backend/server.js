import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import movieRoutes from "./routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Movie Watchlist API is running.",
    data: null,
  });
});

app.use("/api/movies", movieRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
    data: null,
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
  }
}

startServer();