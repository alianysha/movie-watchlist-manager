import express from "express";
import mongoose from "mongoose";
import Movie from "./Movie.js";

const router = express.Router();

const Counter =
  mongoose.models.MovieCounter ||
  mongoose.model(
    "MovieCounter",
    new mongoose.Schema({
      _id: String,
      sequence: { type: Number, default: 0 },
    })
  );

const genres = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller",
];

const platforms = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other",
];

const statuses = ["To Watch", "Watching", "Watched"];

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
  });
}

// GET /api/movies/stats
router.get("/stats", async (req, res) => {
  try {
    const movies = await Movie.find();

    const counts = {
      "To Watch": 0,
      Watching: 0,
      Watched: 0,
    };

    let watchedMinutes = 0;
    let ratingSum = 0;
    let ratedCount = 0;
    const genreCounts = {};

    for (const movie of movies) {
      counts[movie.status]++;

      if (movie.status === "Watched") {
        watchedMinutes += movie.runtime;

        if (movie.rating != null) {
          ratingSum += movie.rating;
          ratedCount++;
        }

        genreCounts[movie.genre] =
          (genreCounts[movie.genre] || 0) + 1;
      }
    }

    const topGenre = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    res.json({
      success: true,
      message: "Statistics loaded",
      data: {
        totalMovies: movies.length,
        counts,
        hoursWatched: Number((watchedMinutes / 60).toFixed(1)),
        averageRating: ratedCount
          ? Number((ratingSum / ratedCount).toFixed(1))
          : 0,
        topGenre,
      },
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/movies/watch-next
router.get("/watch-next", async (req, res) => {
  try {
    const movie = await Movie.findOne({ status: "To Watch" })
      .sort({ priority: -1, runtime: 1 });

    if (!movie) {
      return sendError(res, 404, "No movies are waiting to be watched.");
    }

    res.json({
      success: true,
      message: "Your next movie",
      data: movie,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// GET /api/movies?status=&genre=&search=&page=
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 6;
    const filter = {};

    if (req.query.status && statuses.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.genre && genres.includes(req.query.genre)) {
      filter.genre = req.query.genre;
    }

    if (req.query.search) {
      filter.title = {
        $regex: req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    }

    const totalMovies = await Movie.countDocuments(filter);
    const totalPages = Math.ceil(totalMovies / limit);

    const movies = await Movie.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      message: "Movies loaded",
      data: { movies, totalMovies, totalPages, page },
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// POST /api/movies
router.post("/", async (req, res) => {
  try {
    const { title, genre, releaseYear, runtime, platform, priority } = req.body;
    const year = Number(releaseYear);
    const duration = Number(runtime);
    const rank = Number(priority);

    if (!title?.trim()) {
      return sendError(res, 400, "Movie title is required.");
    }

    if (!genres.includes(genre)) {
      return sendError(res, 400, "Select a valid genre.");
    }

    if (!platforms.includes(platform)) {
      return sendError(res, 400, "Select a valid platform.");
    }

    if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear()) {
      return sendError(res, 400, "Release year must be between 1950 and the current year.");
    }

    if (!Number.isInteger(duration) || duration < 30 || duration > 300) {
      return sendError(res, 400, "Runtime must be between 30 and 300 minutes.");
    }

    if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
      return sendError(res, 400, "Priority must be between 1 and 5.");
    }

    const duplicate = await Movie.findOne({
      title: { $regex: `^${title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      releaseYear: year,
    });

    if (duplicate) {
      return sendError(res, 409, "This movie title and release year already exist.");
    }

    const counter = await Counter.findOneAndUpdate(
      { _id: String(year) },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const movieCode = `MV-${year}-${String(counter.sequence).padStart(3, "0")}`;

    const movie = await Movie.create({
      movieCode,
      title: title.trim(),
      genre,
      releaseYear: year,
      runtime: duration,
      platform,
      priority: rank,
      status: "To Watch",
      rating: null,
      watchedDate: null,
    });

    res.status(201).json({
      success: true,
      message: "Movie added successfully.",
      data: movie,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "This movie already exists or its code is duplicated.");
    }
    sendError(res, 400, error.message);
  }
});

// PATCH /api/movies/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return sendError(res, 404, "Movie not found.");
    }

    const { status, rating } = req.body;

    if (!statuses.includes(status)) {
      return sendError(res, 400, "Invalid status.");
    }

    if (movie.status === "Watched") {
      return sendError(res, 400, "Watched is final; its status cannot be changed.");
    }

    const allowed = {
      "To Watch": ["Watching", "Watched"],
      Watching: ["Watched", "To Watch"],
    };

    if (!allowed[movie.status].includes(status)) {
      return sendError(res, 400, `Cannot change status from ${movie.status} to ${status}.`);
    }

    if (status === "Watched") {
      const score = Number(rating);

      if (!Number.isInteger(score) || score < 1 || score > 10) {
        return sendError(res, 400, "A rating from 1 to 10 is required to mark a movie as Watched.");
      }

      movie.rating = score;
      movie.watchedDate = new Date();
    } else {
      if (rating !== undefined && rating !== null && rating !== "") {
        return sendError(res, 400, "Rating is allowed only for Watched movies.");
      }

      movie.rating = null;
      movie.watchedDate = null;
    }

    movie.status = status;
    await movie.save();

    res.json({
      success: true,
      message: "Movie status updated successfully.",
      data: movie,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// PATCH /api/movies/:id/rating
router.patch("/:id/rating", async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return sendError(res, 404, "Movie not found.");

    if (movie.status !== "Watched") {
      return sendError(res, 400, "Only Watched movies can have a rating.");
    }

    const rating = Number(req.body.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return sendError(res, 400, "Rating must be a whole number from 1 to 10.");
    }

    movie.rating = rating;
    await movie.save();

    res.json({
      success: true,
      message: "Rating updated.",
      data: movie,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// PUT /api/movies/:id
router.put("/:id", async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return sendError(res, 404, "Movie not found.");

    const { title, genre, runtime, platform, priority } = req.body;

    if (title !== undefined && !title.trim()) {
      return sendError(res, 400, "Movie title is required.");
    }
    if (genre !== undefined && !genres.includes(genre)) {
      return sendError(res, 400, "Select a valid genre.");
    }
    if (runtime !== undefined && (!Number.isInteger(Number(runtime)) || Number(runtime) < 30 || Number(runtime) > 300)) {
      return sendError(res, 400, "Runtime must be between 30 and 300 minutes.");
    }
    if (platform !== undefined && !platforms.includes(platform)) {
      return sendError(res, 400, "Select a valid platform.");
    }
    if (priority !== undefined && (!Number.isInteger(Number(priority)) || Number(priority) < 1 || Number(priority) > 5)) {
      return sendError(res, 400, "Priority must be between 1 and 5.");
    }

    if (title !== undefined) {
      const duplicate = await Movie.findOne({
        _id: { $ne: movie._id },
        title: { $regex: `^${title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
        releaseYear: movie.releaseYear,
      });

      if (duplicate) {
        return sendError(res, 409, "Another movie with this title and release year already exists.");
      }

      movie.title = title.trim();
    }

    if (genre !== undefined) movie.genre = genre;
    if (runtime !== undefined) movie.runtime = Number(runtime);
    if (platform !== undefined) movie.platform = platform;
    if (priority !== undefined) movie.priority = Number(priority);

    await movie.save();

    res.json({
      success: true,
      message: "Movie updated successfully.",
      data: movie,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

// DELETE /api/movies/:id
router.delete("/:id", async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return sendError(res, 404, "Movie not found.");

    if (movie.status === "Watching") {
      return sendError(res, 400, "A movie currently being watched cannot be deleted.");
    }

    await movie.deleteOne();

    res.json({
      success: true,
      message: "Movie deleted successfully.",
      data: movie,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

export default router;